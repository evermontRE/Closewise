-- Authenticated client and property directory workflow.
-- Apply after 0003_commission_workflow.sql.

begin;

alter table public.clients
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table public.properties
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

create index if not exists clients_workspace_name_idx
  on public.clients(workspace_id, lower(display_name))
  where deleted_at is null;

create index if not exists properties_workspace_address_idx
  on public.properties(workspace_id, normalized_address)
  where deleted_at is null;

create or replace function public.mutate_directory_record(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_client_mutation_id text,
  p_entity_type text,
  p_operation text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_payload_hash text,
  p_record jsonb
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
begin
  if p_client_mutation_id is null or length(trim(p_client_mutation_id)) < 8 then
    raise exception 'A stable client mutation identifier is required';
  end if;

  if p_entity_type not in ('client', 'property') then
    raise exception 'Unsupported directory entity';
  end if;

  if p_operation not in ('create', 'update', 'void') then
    raise exception 'Unsupported directory operation';
  end if;

  if not exists (
    select 1
      from public.workspace_members
     where workspace_id = p_workspace_id
       and user_id = p_actor_id
       and role in ('owner', 'admin', 'member', 'bookkeeper')
  ) then
    raise exception 'Not authorized to change directory records';
  end if;

  select entity_id, payload_hash, operation, result_version
    into v_entity_id, v_existing_hash, v_existing_operation, v_existing_version
    from public.sync_operations
   where workspace_id = p_workspace_id
     and client_mutation_id = p_client_mutation_id;

  if v_entity_id is not null then
    if v_existing_hash is distinct from nullif(p_payload_hash, '') then
      raise exception 'Idempotency key was already used for different content';
    end if;
    return jsonb_build_object(
      'id', v_entity_id,
      'operation', v_existing_operation,
      'version', v_existing_version
    );
  end if;

  if p_operation <> 'create' and (p_entity_id is null or p_expected_version is null) then
    raise exception 'Record identifier and expected version are required';
  end if;

  if p_entity_type = 'client' then
    if p_operation = 'create' then
      insert into public.clients (
        workspace_id, display_name, email, phone, source, notes, created_by
      ) values (
        p_workspace_id,
        p_record ->> 'displayName',
        nullif(p_record ->> 'email', ''),
        nullif(p_record ->> 'phone', ''),
        nullif(p_record ->> 'source', ''),
        nullif(p_record ->> 'notes', ''),
        p_actor_id
      )
      returning id, version, to_jsonb(clients.*)
        into v_entity_id, v_version, v_after;
    else
      select to_jsonb(c.*)
        into v_before
        from public.clients c
       where c.id = p_entity_id
         and c.workspace_id = p_workspace_id
         and c.deleted_at is null
       for update;

      if v_before is null then raise exception 'Record not found'; end if;
      if (v_before ->> 'version')::bigint <> p_expected_version then
        raise exception using errcode = '40001', message = 'Record version conflict';
      end if;

      if p_operation = 'update' then
        update public.clients
           set display_name = p_record ->> 'displayName',
               email = nullif(p_record ->> 'email', ''),
               phone = nullif(p_record ->> 'phone', ''),
               source = nullif(p_record ->> 'source', ''),
               notes = nullif(p_record ->> 'notes', '')
         where id = p_entity_id
        returning id, version, to_jsonb(clients.*)
          into v_entity_id, v_version, v_after;
      else
        v_reason := nullif(trim(p_record ->> 'reason'), '');
        if v_reason is null or length(v_reason) < 5 then
          raise exception 'A void reason is required';
        end if;
        update public.clients
           set void_reason = v_reason,
               voided_at = now(),
               voided_by = p_actor_id,
               deleted_at = now()
         where id = p_entity_id
        returning id, version, to_jsonb(clients.*)
          into v_entity_id, v_version, v_after;
      end if;
    end if;
  else
    if p_operation = 'create' then
      insert into public.properties (
        workspace_id, address_line_1, address_line_2, city, region,
        postal_code, country, normalized_address, notes, created_by
      ) values (
        p_workspace_id,
        p_record ->> 'addressLine1',
        nullif(p_record ->> 'addressLine2', ''),
        nullif(p_record ->> 'city', ''),
        nullif(p_record ->> 'region', ''),
        nullif(p_record ->> 'postalCode', ''),
        coalesce(nullif(p_record ->> 'country', ''), 'US'),
        nullif(p_record ->> 'normalizedAddress', ''),
        nullif(p_record ->> 'notes', ''),
        p_actor_id
      )
      returning id, version, to_jsonb(properties.*)
        into v_entity_id, v_version, v_after;
    else
      select to_jsonb(p.*)
        into v_before
        from public.properties p
       where p.id = p_entity_id
         and p.workspace_id = p_workspace_id
         and p.deleted_at is null
       for update;

      if v_before is null then raise exception 'Record not found'; end if;
      if (v_before ->> 'version')::bigint <> p_expected_version then
        raise exception using errcode = '40001', message = 'Record version conflict';
      end if;

      if p_operation = 'update' then
        update public.properties
           set address_line_1 = p_record ->> 'addressLine1',
               address_line_2 = nullif(p_record ->> 'addressLine2', ''),
               city = nullif(p_record ->> 'city', ''),
               region = nullif(p_record ->> 'region', ''),
               postal_code = nullif(p_record ->> 'postalCode', ''),
               country = coalesce(nullif(p_record ->> 'country', ''), 'US'),
               normalized_address = nullif(p_record ->> 'normalizedAddress', ''),
               notes = nullif(p_record ->> 'notes', '')
         where id = p_entity_id
        returning id, version, to_jsonb(properties.*)
          into v_entity_id, v_version, v_after;
      else
        v_reason := nullif(trim(p_record ->> 'reason'), '');
        if v_reason is null or length(v_reason) < 5 then
          raise exception 'A void reason is required';
        end if;
        update public.properties
           set void_reason = v_reason,
               voided_at = now(),
               voided_by = p_actor_id,
               deleted_at = now()
         where id = p_entity_id
        returning id, version, to_jsonb(properties.*)
          into v_entity_id, v_version, v_after;
      end if;
    end if;
  end if;

  insert into public.sync_operations (
    workspace_id, user_id, device_id, client_mutation_id, entity_type,
    entity_id, operation, base_version, result_version, payload_hash, status
  ) values (
    p_workspace_id,
    p_actor_id,
    coalesce(nullif(p_record ->> 'deviceId', ''), 'web'),
    p_client_mutation_id,
    p_entity_type,
    v_entity_id,
    p_operation,
    p_expected_version,
    v_version,
    nullif(p_payload_hash, ''),
    'applied'
  );

  insert into public.audit_events (
    workspace_id, actor_id, action, entity_type, entity_id, reason,
    before_data, after_data, request_id
  ) values (
    p_workspace_id,
    p_actor_id,
    p_operation,
    p_entity_type,
    v_entity_id,
    v_reason,
    v_before,
    v_after,
    p_client_mutation_id
  );

  return jsonb_build_object(
    'id', v_entity_id,
    'operation', p_operation,
    'version', v_version
  );
end;
$$;

revoke all on function public.mutate_directory_record(
  uuid, uuid, text, text, text, uuid, bigint, text, jsonb
) from public;
revoke all on function public.mutate_directory_record(
  uuid, uuid, text, text, text, uuid, bigint, text, jsonb
) from authenticated;
grant execute on function public.mutate_directory_record(
  uuid, uuid, text, text, text, uuid, bigint, text, jsonb
) to service_role;

commit;
