-- Private receipt storage metadata and verified upload workflow.
-- Apply after 0006_bank_workflow.sql.

begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-receipts','finance-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.attachments
  add column if not exists status text not null default 'pending',
  add column if not exists declared_sha256 text,
  add column if not exists verified_at timestamptz,
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table public.attachments add constraint attachments_status_check check(status in('pending','ready','failed','void'));
alter table public.attachments add constraint attachments_record_type_check check(record_type in('transaction','bank_transaction','commission'));
alter table public.attachments add constraint attachments_sha256_check check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$');
alter table public.attachments add constraint attachments_declared_sha256_check check(declared_sha256 is null or declared_sha256 ~ '^[a-f0-9]{64}$');

create trigger attachments_version_trigger before update on public.attachments for each row execute function public.bump_record_version();
create index if not exists attachments_workspace_record_idx on public.attachments(workspace_id,record_type,record_id,created_at desc) where deleted_at is null;

create or replace function public.mutate_receipt_record(
  p_workspace_id uuid,p_actor_id uuid,p_client_mutation_id text,p_operation text,
  p_receipt_id uuid,p_expected_version bigint,p_payload_hash text,p_record jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;v_version bigint;v_before jsonb;v_after jsonb;v_reason text;v_path text;
  v_existing_hash text;v_existing_entity text;v_existing_version bigint;v_status text;v_record_type text;v_record_id uuid;
begin
  if p_operation not in('create','finalize','void') then raise exception 'Unsupported receipt operation';end if;
  if p_client_mutation_id is null or length(trim(p_client_mutation_id))<8 then raise exception 'A stable client mutation identifier is required';end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in('owner','admin','member','bookkeeper')) then raise exception 'Not authorized to change receipts';end if;
  select entity_id,entity_type,payload_hash,result_version into v_id,v_existing_entity,v_existing_hash,v_existing_version from public.sync_operations where workspace_id=p_workspace_id and client_mutation_id=p_client_mutation_id;
  if v_id is not null then
    if v_existing_entity<>'attachment' or v_existing_hash is distinct from nullif(p_payload_hash,'') then raise exception 'Idempotency key was already used for different content';end if;
    select status,storage_path into v_status,v_path from public.attachments where id=v_id;
    return jsonb_build_object('id',v_id,'status',v_status,'version',v_existing_version,'storagePath',v_path);
  end if;

  if p_operation='create' then
    v_record_type:=p_record->>'recordType';v_record_id:=nullif(p_record->>'recordId','')::uuid;
    if v_record_type='transaction' and not exists(select 1 from public.transactions where id=v_record_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Linked transaction not found';end if;
    if v_record_type='bank_transaction' and not exists(select 1 from public.bank_transactions where id=v_record_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Linked bank transaction not found';end if;
    if v_record_type='commission' and not exists(select 1 from public.commissions where id=v_record_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Linked commission not found';end if;
    if v_record_type not in('transaction','bank_transaction','commission') then raise exception 'Receipt record type is not supported';end if;
    if p_record->>'mimeType' not in('application/pdf','image/jpeg','image/png','image/webp') then raise exception 'Receipt file type is not supported';end if;
    if (p_record->>'sizeBytes')::bigint<1 or (p_record->>'sizeBytes')::bigint>10485760 then raise exception 'Receipt file size must be between 1 byte and 10 MB';end if;
    v_id:=gen_random_uuid();v_path:=p_workspace_id::text||'/'||v_id::text||'/'||(p_record->>'safeFileName');
    insert into public.attachments(id,workspace_id,storage_path,file_name,mime_type,size_bytes,declared_sha256,record_type,record_id,uploaded_by,status)
    values(v_id,p_workspace_id,v_path,p_record->>'fileName',p_record->>'mimeType',(p_record->>'sizeBytes')::bigint,nullif(p_record->>'declaredSha256',''),v_record_type,v_record_id,p_actor_id,'pending')
    returning version into v_version;
  else
    select to_jsonb(a.*),a.status,a.record_type,a.record_id,a.storage_path into v_before,v_status,v_record_type,v_record_id,v_path from public.attachments a where a.id=p_receipt_id and a.workspace_id=p_workspace_id and a.deleted_at is null for update;
    if v_before is null then raise exception 'Receipt not found';end if;
    if (v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;
    if p_operation='finalize' then
      if v_status<>'pending' then raise exception 'Only pending receipts can be finalized';end if;
      if (p_record->>'actualSizeBytes')::bigint<>(v_before->>'size_bytes')::bigint then raise exception 'Receipt size mismatch';end if;
      if p_record->>'actualMimeType' is distinct from v_before->>'mime_type' then raise exception 'Receipt file type mismatch';end if;
      if nullif(v_before->>'declared_sha256','') is not null and lower(p_record->>'actualSha256')<>lower(v_before->>'declared_sha256') then raise exception 'Receipt checksum mismatch';end if;
      update public.attachments set status='ready',sha256=lower(p_record->>'actualSha256'),verified_at=now() where id=p_receipt_id returning id,version into v_id,v_version;
      if v_record_type='transaction' then
        update public.transactions set receipt_status='attached' where id=v_record_id;
        insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)
        values(p_workspace_id,p_actor_id,'receipt_status_update','transaction',v_record_id,jsonb_build_object('receiptStatus','attached','receiptId',v_id),p_client_mutation_id);
      end if;
    else
      v_reason:=nullif(trim(p_record->>'reason'),'');if v_reason is null or length(v_reason)<5 then raise exception 'A void reason is required';end if;
      update public.attachments set status='void',void_reason=v_reason,voided_at=now(),voided_by=p_actor_id,deleted_at=now() where id=p_receipt_id returning id,version into v_id,v_version;
      if v_record_type='transaction' and not exists(select 1 from public.attachments where workspace_id=p_workspace_id and record_type='transaction' and record_id=v_record_id and status='ready' and deleted_at is null and id<>p_receipt_id) then
        update public.transactions set receipt_status='missing' where id=v_record_id;
        insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)
        values(p_workspace_id,p_actor_id,'receipt_status_update','transaction',v_record_id,jsonb_build_object('receiptStatus','missing','receiptId',v_id),p_client_mutation_id);
      end if;
    end if;
  end if;
  select to_jsonb(a.*) into v_after from public.attachments a where a.id=v_id;
  insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)
  values(p_workspace_id,p_actor_id,coalesce(nullif(p_record->>'deviceId',''),'web'),p_client_mutation_id,'attachment',v_id,case when p_operation='create' then 'create' when p_operation='void' then 'void' else 'update' end,p_expected_version,v_version,nullif(p_payload_hash,''),'applied');
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,reason,before_data,after_data,request_id)
  values(p_workspace_id,p_actor_id,p_operation,'attachment',v_id,v_reason,v_before,v_after,p_client_mutation_id);
  return jsonb_build_object('id',v_id,'status',v_after->>'status','version',v_version,'storagePath',v_path);
end;$$;

revoke all on function public.mutate_receipt_record(uuid,uuid,text,text,uuid,bigint,text,jsonb) from public,authenticated;
grant execute on function public.mutate_receipt_record(uuid,uuid,text,text,uuid,bigint,text,jsonb) to service_role;

commit;
