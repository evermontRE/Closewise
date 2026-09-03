-- Provider-neutral bank connections with Plaid as the first adapter.
begin;

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('plaid')),
  provider_item_id text not null,
  institution_id text,
  institution_name text,
  access_token_ciphertext text not null,
  sync_cursor text,
  status text not null default 'syncing' check (status in ('syncing','healthy','action_required','error','disconnected')),
  error_code text,
  error_message text,
  consent_expires_at timestamptz,
  last_webhook_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_succeeded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_item_id)
);

alter table public.bank_accounts
  add column if not exists connection_id uuid references public.bank_connections(id) on delete set null,
  add column if not exists current_balance numeric(14,2),
  add column if not exists available_balance numeric(14,2),
  add column if not exists balance_updated_at timestamptz;

alter table public.bank_transactions
  add column if not exists provider_pending boolean not null default false,
  add column if not exists provider_category text,
  add column if not exists provider_modified_at timestamptz,
  add column if not exists provider_removed_at timestamptz;

create unique index if not exists bank_transactions_provider_id_idx
  on public.bank_transactions(workspace_id, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists bank_connections_health_idx on public.bank_connections(workspace_id,status,updated_at desc);

create table public.bank_connection_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.bank_connections(id) on delete cascade,
  provider text not null,
  event_type text not null,
  event_code text not null,
  body_sha256 text not null unique,
  signature_verified boolean not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create table public.bank_reconciliation_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  target_type text not null check (target_type in ('transaction','commission')),
  target_id uuid not null,
  confidence integer not null check (confidence between 0 and 100),
  explanation text not null,
  status text not null default 'suggested' check (status in ('suggested','accepted','dismissed','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bank_transaction_id,target_type,target_id)
);

alter table public.bank_connections enable row level security;
alter table public.bank_connection_events enable row level security;
alter table public.bank_reconciliation_suggestions enable row level security;

create policy bank_suggestions_member_read on public.bank_reconciliation_suggestions for select
  using (public.is_workspace_member(workspace_id));

create or replace function public.connect_plaid_item(
  p_workspace_id uuid, p_actor_id uuid, p_item_id text, p_access_token_ciphertext text,
  p_institution_id text, p_institution_name text, p_accounts jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_connection_id uuid; v_account jsonb; v_account_id uuid; v_count integer:=0; v_type text;
begin
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in ('owner','admin')) then raise exception 'Only workspace owners and administrators can connect banks'; end if;
  if nullif(trim(p_item_id),'') is null or nullif(trim(p_access_token_ciphertext),'') is null then raise exception 'Bank connection credentials are required'; end if;
  if jsonb_typeof(p_accounts)<>'array' or jsonb_array_length(p_accounts)=0 then raise exception 'Plaid returned no bank accounts'; end if;
  insert into public.bank_connections(workspace_id,provider,provider_item_id,institution_id,institution_name,access_token_ciphertext,status,created_by)
  values(p_workspace_id,'plaid',p_item_id,nullif(p_institution_id,''),nullif(p_institution_name,''),p_access_token_ciphertext,'syncing',p_actor_id)
  on conflict(provider,provider_item_id) do update set access_token_ciphertext=excluded.access_token_ciphertext,institution_id=excluded.institution_id,institution_name=excluded.institution_name,status='syncing',error_code=null,error_message=null,updated_at=now()
  returning id into v_connection_id;
  for v_account in select value from jsonb_array_elements(p_accounts) loop
    v_type:=case when v_account->>'type'='depository' and v_account->>'subtype'='checking' then 'checking' when v_account->>'type'='depository' then 'savings' when v_account->>'type'='credit' then 'credit_card' when v_account->>'type'='loan' then 'loan' else 'other' end;
    insert into public.bank_accounts(workspace_id,institution_name,account_name,account_type,mask,currency,connection_provider,provider_account_id,connection_id,current_balance,available_balance,balance_updated_at,is_active,created_by)
    values(p_workspace_id,nullif(p_institution_name,''),coalesce(nullif(v_account->>'name',''),'Bank account'),v_type,nullif(v_account->>'mask',''),coalesce(nullif(v_account#>>'{balances,iso_currency_code}',''),'USD'),'plaid',v_account->>'account_id',v_connection_id,nullif(v_account#>>'{balances,current}','')::numeric,nullif(v_account#>>'{balances,available}','')::numeric,now(),true,p_actor_id)
    on conflict(workspace_id,connection_provider,provider_account_id) do update set institution_name=excluded.institution_name,account_name=excluded.account_name,account_type=excluded.account_type,mask=excluded.mask,currency=excluded.currency,connection_id=excluded.connection_id,current_balance=excluded.current_balance,available_balance=excluded.available_balance,balance_updated_at=now(),is_active=true,deleted_at=null,updated_at=now()
    returning id into v_account_id;
    v_count:=v_count+1;
  end loop;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)
  values(p_workspace_id,p_actor_id,'create','bank_connection',v_connection_id,jsonb_build_object('provider','plaid','institutionName',p_institution_name,'accountCount',v_count),'plaid-connect:'||p_item_id);
  return jsonb_build_object('id',v_connection_id,'accounts',v_count,'status','syncing');
end; $$;

create or replace function public.apply_plaid_transaction_sync(
  p_connection_id uuid, p_added jsonb, p_modified jsonb, p_removed jsonb, p_next_cursor text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_workspace_id uuid; v_row jsonb; v_account_id uuid; v_added integer:=0; v_modified integer:=0; v_removed integer:=0;
begin
  select workspace_id into v_workspace_id from public.bank_connections where id=p_connection_id and provider='plaid' and status<>'disconnected' for update;
  if v_workspace_id is null then raise exception 'Active bank connection not found'; end if;
  update public.bank_connections set status='syncing',last_sync_started_at=now(),error_code=null,error_message=null,updated_at=now() where id=p_connection_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_added,'[]'::jsonb)) loop
    select id into v_account_id from public.bank_accounts where connection_id=p_connection_id and provider_account_id=v_row->>'providerAccountId' and deleted_at is null;
    if v_account_id is null then continue; end if;
    insert into public.bank_transactions(workspace_id,bank_account_id,provider_transaction_id,fingerprint,posted_date,description,amount,direction,status,merchant_name,raw_data,review_priority,provider_pending,provider_category)
    values(v_workspace_id,v_account_id,v_row->>'providerTransactionId',v_row->>'fingerprint',(v_row->>'postedDate')::date,v_row->>'description',(v_row->>'amount')::numeric,v_row->>'direction','new',nullif(v_row->>'merchantName',''),coalesce(v_row->'rawData','{}'::jsonb),(case when abs((v_row->>'amount')::numeric)>=1000 then 50 when abs((v_row->>'amount')::numeric)>=250 then 20 else 0 end)+(case when lower(v_row->>'description')~'(commission|closing|title|escrow)' then 15 else 0 end),coalesce((v_row->>'pending')::boolean,false),nullif(v_row->>'providerCategory',''))
    on conflict(workspace_id,provider_transaction_id) where provider_transaction_id is not null do update set bank_account_id=excluded.bank_account_id,posted_date=excluded.posted_date,description=excluded.description,amount=excluded.amount,direction=excluded.direction,merchant_name=excluded.merchant_name,raw_data=excluded.raw_data,provider_pending=excluded.provider_pending,provider_category=excluded.provider_category,provider_modified_at=case when bank_transactions.raw_data is distinct from excluded.raw_data then now() else bank_transactions.provider_modified_at end,provider_removed_at=null,updated_at=now();
    v_added:=v_added+1;
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_modified,'[]'::jsonb)) loop
    update public.bank_transactions set posted_date=(v_row->>'postedDate')::date,description=v_row->>'description',amount=(v_row->>'amount')::numeric,direction=v_row->>'direction',merchant_name=nullif(v_row->>'merchantName',''),raw_data=coalesce(v_row->'rawData','{}'::jsonb),provider_pending=coalesce((v_row->>'pending')::boolean,false),provider_category=nullif(v_row->>'providerCategory',''),provider_modified_at=now(),updated_at=now()
    where workspace_id=v_workspace_id and provider_transaction_id=v_row->>'providerTransactionId';
    if found then v_modified:=v_modified+1; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_removed,'[]'::jsonb)) loop
    update public.bank_transactions set provider_removed_at=now(),provider_modified_at=now(),updated_at=now() where workspace_id=v_workspace_id and provider_transaction_id=v_row->>'transaction_id';
    if found then v_removed:=v_removed+1; end if;
  end loop;
  update public.bank_connections set sync_cursor=p_next_cursor,status='healthy',last_sync_succeeded_at=now(),updated_at=now() where id=p_connection_id;

  insert into public.bank_reconciliation_suggestions(workspace_id,bank_transaction_id,target_type,target_id,confidence,explanation)
  select b.workspace_id,b.id,'commission',c.id,case when abs(b.posted_date-coalesce(c.closed_date,c.expected_closing_date))<=1 then 96 when abs(b.posted_date-coalesce(c.closed_date,c.expected_closing_date))<=3 then 92 else 84 end,'Exact commission amount within seven days of the bank deposit.'
  from public.bank_transactions b join public.commissions c on c.workspace_id=b.workspace_id and c.status='paid' and c.net_received=b.amount and abs(b.posted_date-coalesce(c.closed_date,c.expected_closing_date))<=7 and c.deleted_at is null
  where b.workspace_id=v_workspace_id and b.status='new' and b.amount>0 and b.provider_removed_at is null and not b.provider_pending
  on conflict(bank_transaction_id,target_type,target_id) do update set confidence=excluded.confidence,explanation=excluded.explanation,status='suggested',updated_at=now();

  insert into public.bank_reconciliation_suggestions(workspace_id,bank_transaction_id,target_type,target_id,confidence,explanation)
  select b.workspace_id,b.id,'transaction',t.id,case when abs(b.posted_date-t.transaction_date)<=1 then 96 when abs(b.posted_date-t.transaction_date)<=3 then 92 else 84 end,'Exact bookkeeping amount within seven days of the bank transaction.'
  from public.bank_transactions b join public.transactions t on t.workspace_id=b.workspace_id and t.amount=abs(b.amount) and abs(b.posted_date-t.transaction_date)<=7 and t.deleted_at is null and t.voided_at is null and ((b.amount<0 and t.type in ('expense','owner_draw')) or (b.amount>0 and t.type in ('income','owner_contribution','refund','reimbursement')))
  where b.workspace_id=v_workspace_id and b.status='new' and b.provider_removed_at is null and not b.provider_pending
  on conflict(bank_transaction_id,target_type,target_id) do update set confidence=excluded.confidence,explanation=excluded.explanation,status='suggested',updated_at=now();
  return jsonb_build_object('added',v_added,'modified',v_modified,'removed',v_removed,'cursor',p_next_cursor);
end; $$;

revoke all on function public.connect_plaid_item(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_plaid_transaction_sync(uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.connect_plaid_item(uuid,uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.apply_plaid_transaction_sync(uuid,jsonb,jsonb,jsonb,text) to service_role;
grant select on public.bank_reconciliation_suggestions to authenticated;

commit;
