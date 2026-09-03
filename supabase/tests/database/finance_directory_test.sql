begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('11000000-0000-4000-8000-000000000001', 'directory-owner@example.test', '{}'::jsonb, '{}'::jsonb),
  ('11000000-0000-4000-8000-000000000002', 'directory-outsider@example.test', '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, owner_id)
values (
  '21000000-0000-4000-8000-000000000001',
  'Directory Workspace',
  '11000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.mutate_directory_record(
      '21000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      'directory-client-create',
      'client', 'create', null, null, 'client-create-hash', '{}'::jsonb
    )$$,
  '42501',
  null,
  'authenticated clients cannot call the service-role directory function'
);
reset role;

create temporary table client_create as
select public.mutate_directory_record(
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'directory-client-create',
  'client',
  'create',
  null,
  null,
  'client-create-hash',
  jsonb_build_object(
    'displayName', 'Avery Morgan',
    'email', 'avery@example.test',
    'phone', '555-0100',
    'source', 'Referral',
    'notes', 'Primary client',
    'deviceId', 'database-test'
  )
) as result;

select is((select (result ->> 'version')::integer from client_create), 1, 'client starts at version one');
select is(
  (select display_name from public.clients where id = (select (result ->> 'id')::uuid from client_create)),
  'Avery Morgan',
  'client fields are persisted'
);
select is(
  (select count(*)::integer from public.sync_operations where client_mutation_id = 'directory-client-create'),
  1,
  'client create writes one sync receipt'
);
select is(
  (select count(*)::integer from public.audit_events where request_id = 'directory-client-create'),
  1,
  'client create writes one audit event'
);
select is(
  public.mutate_directory_record(
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'directory-client-create',
    'client', 'create', null, null, 'client-create-hash', '{}'::jsonb
  ) ->> 'id',
  (select result ->> 'id' from client_create),
  'identical client mutation returns the original record'
);
select throws_ok(
  $$select public.mutate_directory_record(
      '21000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      'directory-client-create',
      'client', 'create', null, null, 'different-hash', '{}'::jsonb
    )$$,
  'P0001',
  'Idempotency key was already used for different content',
  'client mutation key rejects different content'
);

create temporary table client_update as
select public.mutate_directory_record(
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'directory-client-update',
  'client',
  'update',
  (select (result ->> 'id')::uuid from client_create),
  1,
  'client-update-hash',
  '{"displayName":"Avery Morgan-Smith","deviceId":"database-test"}'::jsonb
) as result;

select is((select (result ->> 'version')::integer from client_update), 2, 'client update increments version');
select is(
  (select display_name from public.clients where id = (select (result ->> 'id')::uuid from client_create)),
  'Avery Morgan-Smith',
  'client update replaces validated fields'
);
select throws_ok(
  format(
    $$select public.mutate_directory_record(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'directory-client-stale',
        'client', 'update', %L, 1, 'client-stale-hash',
        '{"displayName":"Stale edit"}'::jsonb
      )$$,
    (select result ->> 'id' from client_create)
  ),
  '40001',
  'Record version conflict',
  'stale client update is rejected'
);

create temporary table client_void as
select public.mutate_directory_record(
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'directory-client-void',
  'client',
  'void',
  (select (result ->> 'id')::uuid from client_create),
  2,
  'client-void-hash',
  '{"reason":"Duplicate client record","deviceId":"database-test"}'::jsonb
) as result;

select ok(
  (select deleted_at is not null and voided_at is not null from public.clients where id = (select (result ->> 'id')::uuid from client_create)),
  'voiding a client removes it from active records without deleting it'
);
select is(
  (select void_reason from public.clients where id = (select (result ->> 'id')::uuid from client_create)),
  'Duplicate client record',
  'client void reason is retained'
);
select is(
  (select count(*)::integer from public.audit_events where entity_type = 'client'),
  3,
  'client create, update, and void are audited'
);
select throws_ok(
  $$select public.mutate_directory_record(
      '21000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000002',
      'directory-client-unauthorized',
      'client', 'create', null, null, 'unauthorized-hash',
      '{"displayName":"Unauthorized"}'::jsonb
    )$$,
  'P0001',
  'Not authorized to change directory records',
  'service function re-verifies the actor role'
);

create temporary table property_create as
select public.mutate_directory_record(
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'directory-property-create',
  'property',
  'create',
  null,
  null,
  'property-create-hash',
  jsonb_build_object(
    'addressLine1', '42 Main Street',
    'city', 'Boston',
    'region', 'MA',
    'postalCode', '02108',
    'country', 'US',
    'normalizedAddress', '42 main street boston ma 02108 us',
    'deviceId', 'database-test'
  )
) as result;

select is((select (result ->> 'version')::integer from property_create), 1, 'property starts at version one');
select is(
  (select normalized_address from public.properties where id = (select (result ->> 'id')::uuid from property_create)),
  '42 main street boston ma 02108 us',
  'property normalized address is persisted'
);

create temporary table property_update as
select public.mutate_directory_record(
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'directory-property-update',
  'property',
  'update',
  (select (result ->> 'id')::uuid from property_create),
  1,
  'property-update-hash',
  '{"addressLine1":"44 Main Street","country":"US","normalizedAddress":"44 main street us","deviceId":"database-test"}'::jsonb
) as result;

select is((select (result ->> 'version')::integer from property_update), 2, 'property update increments version');
select is(
  (select address_line_1 from public.properties where id = (select (result ->> 'id')::uuid from property_create)),
  '44 Main Street',
  'property update persists the replacement address'
);

create temporary table property_void as
select public.mutate_directory_record(
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'directory-property-void',
  'property',
  'void',
  (select (result ->> 'id')::uuid from property_create),
  2,
  'property-void-hash',
  '{"reason":"Incorrect property record","deviceId":"database-test"}'::jsonb
) as result;

select ok(
  (select deleted_at is not null and void_reason = 'Incorrect property record' from public.properties where id = (select (result ->> 'id')::uuid from property_create)),
  'property void retains the record and reason'
);

select * from finish();
rollback;
