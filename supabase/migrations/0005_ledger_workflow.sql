-- Authenticated categories and general financial ledger workflow.
-- Apply after 0004_directory_workflow.sql.

begin;

alter table public.categories
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table public.transactions
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

create index if not exists categories_workspace_kind_name_idx
  on public.categories(workspace_id, kind, lower(name))
  where deleted_at is null;

create or replace function public.mutate_ledger_record(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_client_mutation_id text,
  p_entity_type text,
  p_operation text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_payload_hash text,
  p_record jsonb,
  p_splits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_existing_hash text;
  v_existing_operation text;
  v_existing_version bigint;
  v_before jsonb;
  v_after jsonb;
  v_version bigint;
  v_reason text;
  v_split jsonb;
  v_amount numeric(14,2);
  v_type text;
begin
  if p_client_mutation_id is null or length(trim(p_client_mutation_id)) < 8 then
    raise exception 'A stable client mutation identifier is required';
  end if;
  if p_entity_type not in ('category', 'transaction') then raise exception 'Unsupported ledger entity'; end if;
  if p_operation not in ('create', 'update', 'void') then raise exception 'Unsupported ledger operation'; end if;
  if not exists (
    select 1 from public.workspace_members
     where workspace_id = p_workspace_id and user_id = p_actor_id
       and role in ('owner', 'admin', 'member', 'bookkeeper')
  ) then
    raise exception 'Not authorized to change ledger records';
  end if;

  select entity_id, payload_hash, operation, result_version
    into v_entity_id, v_existing_hash, v_existing_operation, v_existing_version
    from public.sync_operations
   where workspace_id = p_workspace_id and client_mutation_id = p_client_mutation_id;
  if v_entity_id is not null then
    if v_existing_hash is distinct from nullif(p_payload_hash, '') then
      raise exception 'Idempotency key was already used for different content';
    end if;
    return jsonb_build_object('id', v_entity_id, 'operation', v_existing_operation, 'version', v_existing_version);
  end if;

  if p_operation <> 'create' and (p_entity_id is null or p_expected_version is null) then
    raise exception 'Record identifier and expected version are required';
  end if;

  if p_entity_type = 'category' then
    if p_operation = 'create' then
      insert into public.categories (workspace_id, name, kind, schedule_c_line, is_active, created_by)
      values (
        p_workspace_id, p_record ->> 'name', p_record ->> 'kind',
        nullif(p_record ->> 'scheduleCLine', ''), coalesce((p_record ->> 'isActive')::boolean, true), p_actor_id
      ) returning id, version into v_entity_id, v_version;
    else
      select to_jsonb(c.*) into v_before
        from public.categories c
       where c.id = p_entity_id and c.workspace_id = p_workspace_id and c.deleted_at is null
       for update;
      if v_before is null then raise exception 'Record not found'; end if;
      if (v_before ->> 'version')::bigint <> p_expected_version then
        raise exception using errcode = '40001', message = 'Record version conflict';
      end if;
      if (v_before ->> 'is_system')::boolean then raise exception 'System categories cannot be changed'; end if;

      if p_operation = 'update' then
        update public.categories
           set name = p_record ->> 'name', kind = p_record ->> 'kind',
               schedule_c_line = nullif(p_record ->> 'scheduleCLine', ''),
               is_active = coalesce((p_record ->> 'isActive')::boolean, true)
         where id = p_entity_id
        returning id, version into v_entity_id, v_version;
      else
        v_reason := nullif(trim(p_record ->> 'reason'), '');
        if v_reason is null or length(v_reason) < 5 then raise exception 'A void reason is required'; end if;
        update public.categories
           set void_reason = v_reason, voided_at = now(), voided_by = p_actor_id, is_active = false, deleted_at = now()
         where id = p_entity_id
        returning id, version into v_entity_id, v_version;
      end if;
    end if;
    select to_jsonb(c.*) into v_after from public.categories c where c.id = v_entity_id;
  else
    if p_operation <> 'void' then
      v_amount := (p_record ->> 'amount')::numeric;
      v_type := p_record ->> 'type';
      if v_amount <= 0 then raise exception 'Transaction amount must be greater than zero'; end if;
      if jsonb_typeof(coalesce(p_splits, '[]'::jsonb)) <> 'array' then raise exception 'Split lines must be an array'; end if;
      if jsonb_array_length(coalesce(p_splits, '[]'::jsonb)) > 0 and (
        select coalesce(sum((line ->> 'amount')::numeric), 0) from jsonb_array_elements(p_splits) line
      ) <> v_amount then
        raise exception 'Split lines must equal the transaction amount';
      end if;

      if nullif(p_record ->> 'categoryId', '') is not null and not exists (
        select 1 from public.categories c where c.id = (p_record ->> 'categoryId')::uuid
          and c.workspace_id = p_workspace_id and c.deleted_at is null and c.is_active
      ) then raise exception 'Referenced record is not available in this workspace'; end if;
      if nullif(p_record ->> 'clientId', '') is not null and not exists (
        select 1 from public.clients c where c.id = (p_record ->> 'clientId')::uuid
          and c.workspace_id = p_workspace_id and c.deleted_at is null
      ) then raise exception 'Referenced record is not available in this workspace'; end if;
      if nullif(p_record ->> 'propertyId', '') is not null and not exists (
        select 1 from public.properties p where p.id = (p_record ->> 'propertyId')::uuid
          and p.workspace_id = p_workspace_id and p.deleted_at is null
      ) then raise exception 'Referenced record is not available in this workspace'; end if;
      if nullif(p_record ->> 'commissionId', '') is not null and not exists (
        select 1 from public.commissions c where c.id = (p_record ->> 'commissionId')::uuid
          and c.workspace_id = p_workspace_id and c.deleted_at is null
      ) then raise exception 'Referenced record is not available in this workspace'; end if;
      if v_type in ('income', 'expense') and nullif(p_record ->> 'categoryId', '') is not null and not exists (
        select 1 from public.categories c where c.id = (p_record ->> 'categoryId')::uuid and c.kind = v_type
      ) then raise exception 'Category kind must match the transaction type'; end if;

      for v_split in select value from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
        if (v_split ->> 'amount')::numeric <= 0 then raise exception 'Split lines must have positive amounts'; end if;
        if nullif(v_split ->> 'categoryId', '') is not null and not exists (
          select 1 from public.categories c where c.id = (v_split ->> 'categoryId')::uuid
            and c.workspace_id = p_workspace_id and c.deleted_at is null and c.is_active
        ) then raise exception 'Referenced record is not available in this workspace'; end if;
        if nullif(v_split ->> 'propertyId', '') is not null and not exists (
          select 1 from public.properties p where p.id = (v_split ->> 'propertyId')::uuid
            and p.workspace_id = p_workspace_id and p.deleted_at is null
        ) then raise exception 'Referenced record is not available in this workspace'; end if;
        if v_type in ('income', 'expense') and nullif(v_split ->> 'categoryId', '') is not null and not exists (
          select 1 from public.categories c where c.id = (v_split ->> 'categoryId')::uuid and c.kind = v_type
        ) then raise exception 'Category kind must match the transaction type'; end if;
      end loop;
    end if;

    if p_operation = 'create' then
      insert into public.transactions (
        workspace_id, category_id, client_id, property_id, commission_id, transaction_date,
        type, payee, description, amount, payment_method, vendor_tax_id_last4,
        receipt_status, source, notes, created_by
      ) values (
        p_workspace_id, nullif(p_record ->> 'categoryId', '')::uuid,
        nullif(p_record ->> 'clientId', '')::uuid, nullif(p_record ->> 'propertyId', '')::uuid,
        nullif(p_record ->> 'commissionId', '')::uuid, (p_record ->> 'transactionDate')::date,
        v_type, nullif(p_record ->> 'payee', ''), p_record ->> 'description', v_amount,
        nullif(p_record ->> 'paymentMethod', ''), nullif(p_record ->> 'vendorTaxIdLast4', ''),
        p_record ->> 'receiptStatus', 'manual', nullif(p_record ->> 'notes', ''), p_actor_id
      ) returning id, version into v_entity_id, v_version;
    else
      select jsonb_build_object(
        'record', to_jsonb(t.*),
        'splits', coalesce((select jsonb_agg(to_jsonb(s.*) order by s.created_at) from public.transaction_splits s where s.transaction_id = t.id and s.deleted_at is null), '[]'::jsonb)
      ) into v_before
        from public.transactions t
       where t.id = p_entity_id and t.workspace_id = p_workspace_id and t.deleted_at is null
       for update;
      if v_before is null then raise exception 'Record not found'; end if;
      if (v_before -> 'record' ->> 'version')::bigint <> p_expected_version then
        raise exception using errcode = '40001', message = 'Record version conflict';
      end if;

      if p_operation = 'update' then
        update public.transactions set
          category_id = nullif(p_record ->> 'categoryId', '')::uuid,
          client_id = nullif(p_record ->> 'clientId', '')::uuid,
          property_id = nullif(p_record ->> 'propertyId', '')::uuid,
          commission_id = nullif(p_record ->> 'commissionId', '')::uuid,
          transaction_date = (p_record ->> 'transactionDate')::date, type = v_type,
          payee = nullif(p_record ->> 'payee', ''), description = p_record ->> 'description', amount = v_amount,
          payment_method = nullif(p_record ->> 'paymentMethod', ''),
          vendor_tax_id_last4 = nullif(p_record ->> 'vendorTaxIdLast4', ''),
          receipt_status = p_record ->> 'receiptStatus', notes = nullif(p_record ->> 'notes', '')
        where id = p_entity_id returning id, version into v_entity_id, v_version;
        update public.transaction_splits set deleted_at = now() where transaction_id = p_entity_id and deleted_at is null;
      else
        v_reason := nullif(trim(p_record ->> 'reason'), '');
        if v_reason is null or length(v_reason) < 5 then raise exception 'A void reason is required'; end if;
        update public.transactions
           set void_reason = v_reason, voided_at = now(), voided_by = p_actor_id, deleted_at = now()
         where id = p_entity_id returning id, version into v_entity_id, v_version;
      end if;
    end if;

    if p_operation in ('create', 'update') then
      for v_split in select value from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
        insert into public.transaction_splits (
          workspace_id, transaction_id, category_id, property_id, amount, memo, created_by
        ) values (
          p_workspace_id, v_entity_id, nullif(v_split ->> 'categoryId', '')::uuid,
          nullif(v_split ->> 'propertyId', '')::uuid, (v_split ->> 'amount')::numeric,
          nullif(v_split ->> 'memo', ''), p_actor_id
        );
      end loop;
    end if;
    select jsonb_build_object(
      'record', to_jsonb(t.*),
      'splits', coalesce((select jsonb_agg(to_jsonb(s.*) order by s.created_at) from public.transaction_splits s where s.transaction_id = t.id and s.deleted_at is null), '[]'::jsonb)
    ) into v_after from public.transactions t where t.id = v_entity_id;
  end if;

  insert into public.sync_operations (
    workspace_id, user_id, device_id, client_mutation_id, entity_type, entity_id,
    operation, base_version, result_version, payload_hash, status
  ) values (
    p_workspace_id, p_actor_id, coalesce(nullif(p_record ->> 'deviceId', ''), 'web'),
    p_client_mutation_id, p_entity_type, v_entity_id, p_operation,
    p_expected_version, v_version, nullif(p_payload_hash, ''), 'applied'
  );
  insert into public.audit_events (
    workspace_id, actor_id, action, entity_type, entity_id, reason,
    before_data, after_data, request_id
  ) values (
    p_workspace_id, p_actor_id, p_operation, p_entity_type, v_entity_id, v_reason,
    v_before, v_after, p_client_mutation_id
  );
  return jsonb_build_object('id', v_entity_id, 'operation', p_operation, 'version', v_version);
end;
$$;

revoke all on function public.mutate_ledger_record(
  uuid, uuid, text, text, text, uuid, bigint, text, jsonb, jsonb
) from public;
revoke all on function public.mutate_ledger_record(
  uuid, uuid, text, text, text, uuid, bigint, text, jsonb, jsonb
) from authenticated;
grant execute on function public.mutate_ledger_record(
  uuid, uuid, text, text, text, uuid, bigint, text, jsonb, jsonb
) to service_role;

commit;
