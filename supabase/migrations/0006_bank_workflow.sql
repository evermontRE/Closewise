-- Bank statement import, review, matching, and reconciliation workflow.
-- Apply after 0005_ledger_workflow.sql.

begin;

alter table public.bank_accounts
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table public.bank_transactions
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists direction text,
  add column if not exists match_confidence integer check (match_confidence between 0 and 100),
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid references auth.users(id) on delete set null,
  add column if not exists ignored_reason text,
  add column if not exists review_priority integer not null default 0;

update public.bank_transactions set direction = case when amount >= 0 then 'inflow' else 'outflow' end where direction is null;
alter table public.bank_transactions alter column direction set not null;
alter table public.bank_transactions add constraint bank_transactions_direction_check check (direction in ('inflow', 'outflow'));

alter table public.bank_matches
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;
alter table public.bank_matches drop constraint if exists bank_matches_bank_transaction_id_key;
create unique index if not exists bank_matches_one_active_idx on public.bank_matches(bank_transaction_id) where voided_at is null;
create unique index if not exists bank_matches_one_active_transaction_idx on public.bank_matches(transaction_id) where voided_at is null and transaction_id is not null;
create unique index if not exists bank_matches_one_active_commission_idx on public.bank_matches(commission_id) where voided_at is null and commission_id is not null;

create index if not exists bank_transactions_review_queue_idx
  on public.bank_transactions(workspace_id, status, review_priority desc, posted_date desc)
  where deleted_at is null;

create or replace function public.mutate_bank_account(
  p_workspace_id uuid, p_actor_id uuid, p_client_mutation_id text, p_operation text,
  p_entity_id uuid, p_expected_version bigint, p_payload_hash text, p_record jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_version bigint; v_before jsonb; v_after jsonb; v_reason text;
  v_existing_hash text; v_existing_operation text; v_existing_version bigint;
begin
  if p_operation not in ('create', 'update', 'void') then raise exception 'Unsupported bank account operation'; end if;
  if p_client_mutation_id is null or length(trim(p_client_mutation_id)) < 8 then raise exception 'A stable client mutation identifier is required'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_actor_id and role in ('owner','admin','member','bookkeeper')) then raise exception 'Not authorized to change bank accounts'; end if;
  select entity_id, payload_hash, operation, result_version into v_id, v_existing_hash, v_existing_operation, v_existing_version
    from public.sync_operations where workspace_id = p_workspace_id and client_mutation_id = p_client_mutation_id;
  if v_id is not null then
    if v_existing_hash is distinct from nullif(p_payload_hash, '') then raise exception 'Idempotency key was already used for different content'; end if;
    return jsonb_build_object('id', v_id, 'operation', v_existing_operation, 'version', v_existing_version);
  end if;
  if p_operation = 'create' then
    insert into public.bank_accounts (workspace_id, institution_name, account_name, account_type, mask, currency, is_active, created_by)
    values (p_workspace_id, nullif(p_record ->> 'institutionName',''), p_record ->> 'accountName', p_record ->> 'accountType', nullif(p_record ->> 'mask',''), p_record ->> 'currency', coalesce((p_record ->> 'isActive')::boolean,true), p_actor_id)
    returning id, version into v_id, v_version;
  else
    select to_jsonb(a.*) into v_before from public.bank_accounts a where a.id = p_entity_id and a.workspace_id = p_workspace_id and a.deleted_at is null for update;
    if v_before is null then raise exception 'Bank account not found'; end if;
    if (v_before ->> 'version')::bigint <> p_expected_version then raise exception using errcode='40001', message='Record version conflict'; end if;
    if p_operation = 'update' then
      update public.bank_accounts set institution_name=nullif(p_record ->> 'institutionName',''), account_name=p_record ->> 'accountName', account_type=p_record ->> 'accountType', mask=nullif(p_record ->> 'mask',''), currency=p_record ->> 'currency', is_active=coalesce((p_record ->> 'isActive')::boolean,true)
      where id=p_entity_id returning id,version into v_id,v_version;
    else
      v_reason:=nullif(trim(p_record ->> 'reason'),''); if v_reason is null or length(v_reason)<5 then raise exception 'A void reason is required'; end if;
      update public.bank_accounts set void_reason=v_reason,voided_at=now(),voided_by=p_actor_id,is_active=false,deleted_at=now() where id=p_entity_id returning id,version into v_id,v_version;
    end if;
  end if;
  select to_jsonb(a.*) into v_after from public.bank_accounts a where a.id=v_id;
  insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)
  values(p_workspace_id,p_actor_id,coalesce(nullif(p_record ->> 'deviceId',''),'web'),p_client_mutation_id,'bank_account',v_id,p_operation,p_expected_version,v_version,nullif(p_payload_hash,''),'applied');
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,reason,before_data,after_data,request_id)
  values(p_workspace_id,p_actor_id,p_operation,'bank_account',v_id,v_reason,v_before,v_after,p_client_mutation_id);
  return jsonb_build_object('id',v_id,'operation',p_operation,'version',v_version);
end; $$;

create or replace function public.import_bank_statement(
  p_workspace_id uuid, p_actor_id uuid, p_bank_account_id uuid, p_file_name text,
  p_file_hash text, p_device_id text, p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_import_id uuid; v_existing_count integer; v_row jsonb; v_imported integer:=0; v_duplicates integer:=0; v_total integer;
begin
  if not exists (select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in ('owner','admin','member','bookkeeper')) then raise exception 'Not authorized to import bank statements'; end if;
  if not exists (select 1 from public.bank_accounts where id=p_bank_account_id and workspace_id=p_workspace_id and deleted_at is null and is_active) then raise exception 'Bank account not found'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Bank rows must be an array'; end if;
  v_total:=jsonb_array_length(p_rows); if v_total<1 or v_total>10000 then raise exception 'Bank imports must contain between 1 and 10000 rows'; end if;
  select id,row_count into v_import_id,v_existing_count from public.bank_imports where workspace_id=p_workspace_id and file_hash=p_file_hash;
  if v_import_id is not null then return jsonb_build_object('id',v_import_id,'imported',v_existing_count,'duplicates',v_total-v_existing_count,'total',v_total); end if;
  insert into public.bank_imports(workspace_id,bank_account_id,file_name,file_hash,imported_by,row_count)
  values(p_workspace_id,p_bank_account_id,p_file_name,p_file_hash,p_actor_id,0) returning id into v_import_id;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    insert into public.bank_transactions(
      workspace_id,bank_account_id,bank_import_id,provider_transaction_id,fingerprint,posted_date,
      description,amount,direction,status,merchant_name,raw_data,review_priority
    ) values(
      p_workspace_id,p_bank_account_id,v_import_id,nullif(v_row ->> 'providerTransactionId',''),v_row ->> 'fingerprint',(v_row ->> 'postedDate')::date,
      v_row ->> 'description',(v_row ->> 'amount')::numeric,case when (v_row ->> 'amount')::numeric>0 then 'inflow' else 'outflow' end,
      'new',nullif(v_row ->> 'merchantName',''),coalesce(v_row -> 'rawData','{}'::jsonb),
      (case when abs((v_row ->> 'amount')::numeric)>=1000 then 50 when abs((v_row ->> 'amount')::numeric)>=250 then 20 else 0 end)
      +(case when lower(v_row ->> 'description') ~ '(commission|closing|title|escrow)' then 15 else 0 end)
    ) on conflict(workspace_id,fingerprint) do nothing;
    if found then v_imported:=v_imported+1; else v_duplicates:=v_duplicates+1; end if;
  end loop;
  update public.bank_imports set row_count=v_imported where id=v_import_id;
  insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,result_version,payload_hash,status)
  values(p_workspace_id,p_actor_id,coalesce(nullif(p_device_id,''),'web'),'bank-import:'||left(p_file_hash,64),'bank_import',v_import_id,'create',1,p_file_hash,'applied');
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)
  values(p_workspace_id,p_actor_id,'create','bank_import',v_import_id,jsonb_build_object('fileName',p_file_name,'imported',v_imported,'duplicates',v_duplicates,'total',v_total),'bank-import:'||left(p_file_hash,64));
  return jsonb_build_object('id',v_import_id,'imported',v_imported,'duplicates',v_duplicates,'total',v_total);
end; $$;

create or replace function public.review_bank_transaction(
  p_workspace_id uuid, p_actor_id uuid, p_bank_transaction_id uuid,
  p_client_mutation_id text, p_expected_version bigint, p_payload_hash text, p_review jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb; v_after jsonb; v_version bigint; v_status text; v_action text; v_direction text; v_amount numeric(14,2);
  v_existing_hash text; v_existing_version bigint; v_existing_id uuid; v_ledger_id uuid; v_target_id uuid; v_target_type text; v_reason text;
begin
  if not exists (select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in ('owner','admin','member','bookkeeper')) then raise exception 'Not authorized to review bank transactions'; end if;
  select entity_id,payload_hash,result_version into v_existing_id,v_existing_hash,v_existing_version from public.sync_operations where workspace_id=p_workspace_id and client_mutation_id=p_client_mutation_id;
  if v_existing_id is not null then
    if v_existing_hash is distinct from nullif(p_payload_hash,'') then raise exception 'Idempotency key was already used for different content'; end if;
    select status into v_status from public.bank_transactions where id=v_existing_id;
    return jsonb_build_object('id',v_existing_id,'status',v_status,'version',v_existing_version);
  end if;
  select to_jsonb(b.*),b.status,b.direction,b.amount into v_before,v_status,v_direction,v_amount
    from public.bank_transactions b where b.id=p_bank_transaction_id and b.workspace_id=p_workspace_id and b.deleted_at is null for update;
  if v_before is null then raise exception 'Bank transaction not found'; end if;
  if (v_before ->> 'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict'; end if;
  if v_status in ('reconciled','ignored') then raise exception 'Completed bank transactions cannot be changed'; end if;
  v_action:=p_review ->> 'action';

  if v_action='categorize' then
    if v_status='matched' then raise exception 'Matched bank transactions must be rematched, not categorized'; end if;
    v_target_id:=nullif(p_review ->> 'categoryId','')::uuid;
    if not exists(select 1 from public.categories c where c.id=v_target_id and c.workspace_id=p_workspace_id and c.deleted_at is null and c.is_active) then raise exception 'A valid category is required'; end if;
    if exists(select 1 from public.categories c where c.id=v_target_id and lower(c.name)='miscellaneous') then raise exception 'Choose a specific category; Miscellaneous is not available in quick review'; end if;
    if not exists(select 1 from public.categories c where c.id=v_target_id and c.kind=case when v_direction='inflow' then 'income' else 'expense' end) then raise exception 'Category kind must match the bank transaction direction'; end if;
    if nullif(p_review ->> 'clientId','') is not null and not exists(select 1 from public.clients c where c.id=(p_review ->> 'clientId')::uuid and c.workspace_id=p_workspace_id and c.deleted_at is null) then raise exception 'Referenced client does not belong to this workspace'; end if;
    if nullif(p_review ->> 'propertyId','') is not null and not exists(select 1 from public.properties p where p.id=(p_review ->> 'propertyId')::uuid and p.workspace_id=p_workspace_id and p.deleted_at is null) then raise exception 'Referenced property does not belong to this workspace'; end if;
    update public.bank_transactions set category_id=v_target_id,client_id=nullif(p_review ->> 'clientId','')::uuid,property_id=nullif(p_review ->> 'propertyId','')::uuid,status='categorized',reviewed_by=p_actor_id,reviewed_at=now() where id=p_bank_transaction_id returning version into v_version;
  elsif v_action='match' then
    v_target_type:=p_review ->> 'targetType'; v_target_id:=nullif(p_review ->> 'targetId','')::uuid;
    if v_target_type='transaction' then
      if not exists(select 1 from public.transactions t where t.id=v_target_id and t.workspace_id=p_workspace_id and t.deleted_at is null and t.amount=abs(v_amount) and ((v_direction='inflow' and t.type in ('income','owner_contribution','refund','reimbursement','transfer')) or (v_direction='outflow' and t.type in ('expense','owner_draw','transfer')))) then raise exception 'Matched transaction must exist in this workspace with the same amount and cash direction'; end if;
    elsif v_target_type='commission' then
      if v_direction<>'inflow' or not exists(select 1 from public.commissions c where c.id=v_target_id and c.workspace_id=p_workspace_id and c.deleted_at is null and c.net_received=abs(v_amount)) then raise exception 'Matched commission must be an inflow in this workspace with the same net amount'; end if;
    else raise exception 'A transaction or commission match target is required'; end if;
    if exists(select 1 from public.bank_matches m where m.voided_at is null and m.bank_transaction_id<>p_bank_transaction_id and ((v_target_type='transaction' and m.transaction_id=v_target_id) or (v_target_type='commission' and m.commission_id=v_target_id))) then raise exception 'This target is already matched to another bank transaction'; end if;
    update public.bank_matches set voided_at=now(),void_reason='Replaced during review' where bank_transaction_id=p_bank_transaction_id and voided_at is null;
    insert into public.bank_matches(workspace_id,bank_transaction_id,transaction_id,commission_id,matched_by)
    values(p_workspace_id,p_bank_transaction_id,case when v_target_type='transaction' then v_target_id end,case when v_target_type='commission' then v_target_id end,p_actor_id);
    update public.bank_transactions set status='matched',match_confidence=nullif(p_review ->> 'matchConfidence','')::integer,reviewed_by=p_actor_id,reviewed_at=now() where id=p_bank_transaction_id returning version into v_version;
  elsif v_action='reconcile' then
    if v_status='new' then raise exception 'Categorize or match this bank transaction before reconciling'; end if;
    if v_status='categorized' then
      insert into public.transactions(workspace_id,category_id,client_id,property_id,transaction_date,type,payee,description,amount,receipt_status,source,created_by)
      select workspace_id,category_id,client_id,property_id,posted_date,case when direction='inflow' then 'income' else 'expense' end,merchant_name,description,abs(amount),'none','bank_import',p_actor_id
      from public.bank_transactions where id=p_bank_transaction_id returning id into v_ledger_id;
      insert into public.bank_matches(workspace_id,bank_transaction_id,transaction_id,matched_by) values(p_workspace_id,p_bank_transaction_id,v_ledger_id,p_actor_id);
      insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)
      select p_workspace_id,p_actor_id,'create','transaction',v_ledger_id,to_jsonb(t.*),p_client_mutation_id from public.transactions t where t.id=v_ledger_id;
    elsif not exists(select 1 from public.bank_matches where bank_transaction_id=p_bank_transaction_id and voided_at is null) then raise exception 'A valid bank match is required before reconciliation'; end if;
    update public.bank_transactions set status='reconciled',reviewed_by=p_actor_id,reviewed_at=coalesce(reviewed_at,now()),reconciled_by=p_actor_id,reconciled_at=now() where id=p_bank_transaction_id returning version into v_version;
    update public.bank_accounts set last_reconciled_through=greatest(coalesce(last_reconciled_through,'0001-01-01'::date),(v_before ->> 'posted_date')::date) where id=(v_before ->> 'bank_account_id')::uuid;
  elsif v_action='ignore' then
    if v_status='matched' then raise exception 'Matched bank transactions cannot be ignored'; end if;
    v_reason:=nullif(trim(p_review ->> 'reason'),''); if v_reason is null or length(v_reason)<5 then raise exception 'An ignore reason is required'; end if;
    update public.bank_transactions set status='ignored',ignored_reason=v_reason,reviewed_by=p_actor_id,reviewed_at=now() where id=p_bank_transaction_id returning version into v_version;
  else raise exception 'Unsupported bank review action'; end if;

  select to_jsonb(b.*)||jsonb_build_object('ledgerTransactionId',v_ledger_id) into v_after from public.bank_transactions b where b.id=p_bank_transaction_id;
  insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)
  values(p_workspace_id,p_actor_id,coalesce(nullif(p_review ->> 'deviceId',''),'web'),p_client_mutation_id,'bank_transaction',p_bank_transaction_id,'update',p_expected_version,v_version,nullif(p_payload_hash,''),'applied');
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,reason,before_data,after_data,request_id)
  values(p_workspace_id,p_actor_id,v_action,'bank_transaction',p_bank_transaction_id,v_reason,v_before,v_after,p_client_mutation_id);
  return jsonb_strip_nulls(jsonb_build_object('id',p_bank_transaction_id,'status',v_after ->> 'status','version',v_version,'ledgerTransactionId',v_ledger_id));
end; $$;

revoke all on function public.mutate_bank_account(uuid,uuid,text,text,uuid,bigint,text,jsonb) from public, authenticated;
revoke all on function public.import_bank_statement(uuid,uuid,uuid,text,text,text,jsonb) from public, authenticated;
revoke all on function public.review_bank_transaction(uuid,uuid,uuid,text,bigint,text,jsonb) from public, authenticated;
grant execute on function public.mutate_bank_account(uuid,uuid,text,text,uuid,bigint,text,jsonb) to service_role;
grant execute on function public.import_bank_statement(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.review_bank_transaction(uuid,uuid,uuid,text,bigint,text,jsonb) to service_role;

commit;
