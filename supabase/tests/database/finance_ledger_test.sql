begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('12000000-0000-4000-8000-000000000001', 'ledger-owner@example.test', '{}'::jsonb, '{}'::jsonb),
  ('12000000-0000-4000-8000-000000000002', 'ledger-outsider@example.test', '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, owner_id)
values
  ('22000000-0000-4000-8000-000000000001', 'Ledger Workspace', '12000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000002', 'Other Workspace', '12000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.mutate_ledger_record(
      '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
      'ledger-denied-client', 'category', 'create', null, null, 'denied-hash',
      '{"name":"Denied","kind":"expense"}'::jsonb, '[]'::jsonb
    )$$,
  '42501', null, 'authenticated clients cannot call the service-role ledger function'
);
reset role;

create temporary table expense_category as
select public.mutate_ledger_record(
  '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
  'ledger-category-create', 'category', 'create', null, null, 'category-create-hash',
  '{"name":"Advertising","kind":"expense","scheduleCLine":"8","isActive":true,"deviceId":"database-test"}'::jsonb,
  '[]'::jsonb
) as result;

select is((select (result ->> 'version')::integer from expense_category), 1, 'category starts at version one');
select is(
  (select schedule_c_line from public.categories where id = (select (result ->> 'id')::uuid from expense_category)),
  '8', 'Schedule C mapping is persisted'
);
select is((select count(*)::integer from public.sync_operations where client_mutation_id = 'ledger-category-create'), 1, 'category create writes one sync receipt');
select is((select count(*)::integer from public.audit_events where request_id = 'ledger-category-create'), 1, 'category create writes one audit event');
select is(
  public.mutate_ledger_record(
    '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
    'ledger-category-create', 'category', 'create', null, null, 'category-create-hash', '{}'::jsonb, '[]'::jsonb
  ) ->> 'id',
  (select result ->> 'id' from expense_category), 'identical category mutation returns the original record'
);
select throws_ok(
  $$select public.mutate_ledger_record(
      '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
      'ledger-category-create', 'category', 'create', null, null, 'different-hash', '{}'::jsonb, '[]'::jsonb
    )$$,
  'P0001', 'Idempotency key was already used for different content', 'category key rejects different content'
);

create temporary table category_update as
select public.mutate_ledger_record(
  '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
  'ledger-category-update', 'category', 'update',
  (select (result ->> 'id')::uuid from expense_category), 1, 'category-update-hash',
  '{"name":"Marketing and advertising","kind":"expense","scheduleCLine":"8","isActive":true,"deviceId":"database-test"}'::jsonb,
  '[]'::jsonb
) as result;
select is((select (result ->> 'version')::integer from category_update), 2, 'category update increments version');
select is(
  (select name from public.categories where id = (select (result ->> 'id')::uuid from expense_category)),
  'Marketing and advertising', 'category update persists validated fields'
);
select throws_ok(
  format(
    $$select public.mutate_ledger_record(
        '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
        'ledger-category-stale', 'category', 'update', %L, 1, 'stale-hash',
        '{"name":"Stale","kind":"expense","isActive":true}'::jsonb, '[]'::jsonb
      )$$,
    (select result ->> 'id' from expense_category)
  ),
  '40001', 'Record version conflict', 'stale category update is rejected'
);

insert into public.categories (id, workspace_id, name, kind, created_by)
values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Other income', 'income', '12000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'Other workspace expense', 'expense', '12000000-0000-4000-8000-000000000002');
insert into public.properties (id, workspace_id, address_line_1, created_by)
values ('42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '42 Ledger Lane', '12000000-0000-4000-8000-000000000001');

create temporary table transaction_create as
select public.mutate_ledger_record(
  '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
  'ledger-transaction-create', 'transaction', 'create', null, null, 'transaction-create-hash',
  jsonb_build_object(
    'transactionDate', '2026-08-31', 'type', 'expense', 'description', 'Open house marketing',
    'amount', '125.00', 'payee', 'Local Print Shop', 'receiptStatus', 'attached',
    'vendorTaxIdLast4', '1234', 'deviceId', 'database-test'
  ),
  jsonb_build_array(
    jsonb_build_object('categoryId', (select result ->> 'id' from expense_category), 'amount', '75.00', 'memo', 'Flyers'),
    jsonb_build_object('propertyId', '42000000-0000-4000-8000-000000000001', 'amount', '50.00', 'memo', 'Signs')
  )
) as result;

select is((select (result ->> 'version')::integer from transaction_create), 1, 'transaction starts at version one');
select is(
  (select amount::text from public.transactions where id = (select (result ->> 'id')::uuid from transaction_create)),
  '125.00', 'transaction amount is persisted exactly'
);
select is(
  (select count(*)::integer from public.transaction_splits where transaction_id = (select (result ->> 'id')::uuid from transaction_create) and deleted_at is null),
  2, 'transaction split lines are persisted'
);
select is(
  (select sum(amount)::text from public.transaction_splits where transaction_id = (select (result ->> 'id')::uuid from transaction_create) and deleted_at is null),
  '125.00', 'split lines reconcile to the transaction amount'
);
select is((select count(*)::integer from public.sync_operations where client_mutation_id = 'ledger-transaction-create'), 1, 'transaction create writes one sync receipt');
select is((select count(*)::integer from public.audit_events where request_id = 'ledger-transaction-create'), 1, 'transaction create writes one audit event');
select is(
  public.mutate_ledger_record(
    '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
    'ledger-transaction-create', 'transaction', 'create', null, null, 'transaction-create-hash', '{}'::jsonb, '[]'::jsonb
  ) ->> 'id',
  (select result ->> 'id' from transaction_create), 'identical transaction mutation returns the original record'
);
select throws_ok(
  $$select public.mutate_ledger_record(
      '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
      'ledger-kind-mismatch', 'transaction', 'create', null, null, 'kind-hash',
      '{"transactionDate":"2026-08-31","type":"expense","description":"Bad kind","amount":"10.00","categoryId":"32000000-0000-4000-8000-000000000001","receiptStatus":"none"}'::jsonb,
      '[]'::jsonb
    )$$,
  'P0001', 'Category kind must match the transaction type', 'expense cannot use an income category'
);
select throws_ok(
  $$select public.mutate_ledger_record(
      '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
      'ledger-cross-workspace', 'transaction', 'create', null, null, 'cross-hash',
      '{"transactionDate":"2026-08-31","type":"expense","description":"Cross workspace","amount":"10.00","categoryId":"32000000-0000-4000-8000-000000000002","receiptStatus":"none"}'::jsonb,
      '[]'::jsonb
    )$$,
  'P0001', 'Referenced record is not available in this workspace', 'cross-workspace references are rejected'
);

create temporary table transaction_update as
select public.mutate_ledger_record(
  '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
  'ledger-transaction-update', 'transaction', 'update',
  (select (result ->> 'id')::uuid from transaction_create), 1, 'transaction-update-hash',
  jsonb_build_object(
    'transactionDate', '2026-09-01', 'type', 'expense', 'description', 'Updated open house marketing',
    'amount', '150.00', 'receiptStatus', 'attached', 'deviceId', 'database-test'
  ),
  jsonb_build_array(
    jsonb_build_object('categoryId', (select result ->> 'id' from expense_category), 'amount', '150.00', 'memo', 'Combined invoice')
  )
) as result;
select is((select (result ->> 'version')::integer from transaction_update), 2, 'transaction update increments version');
select is(
  (select count(*)::integer from public.transaction_splits where transaction_id = (select (result ->> 'id')::uuid from transaction_create) and deleted_at is null),
  1, 'transaction update replaces active split lines without deleting history'
);

create temporary table transaction_void as
select public.mutate_ledger_record(
  '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
  'ledger-transaction-void', 'transaction', 'void',
  (select (result ->> 'id')::uuid from transaction_create), 2, 'transaction-void-hash',
  '{"reason":"Duplicate bank charge","deviceId":"database-test"}'::jsonb, '[]'::jsonb
) as result;
select ok(
  (select deleted_at is not null and voided_at is not null from public.transactions where id = (select (result ->> 'id')::uuid from transaction_create)),
  'voiding retains the transaction while removing it from active records'
);
select is(
  (select void_reason from public.transactions where id = (select (result ->> 'id')::uuid from transaction_create)),
  'Duplicate bank charge', 'transaction void reason is retained'
);

select public.mutate_ledger_record(
  '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
  'ledger-category-void', 'category', 'void',
  (select (result ->> 'id')::uuid from expense_category), 2, 'category-void-hash',
  '{"reason":"Retired category mapping","deviceId":"database-test"}'::jsonb, '[]'::jsonb
);
select ok(
  (select deleted_at is not null and is_active = false from public.categories where id = (select (result ->> 'id')::uuid from expense_category)),
  'category void is non-destructive and deactivates the category'
);
select throws_ok(
  $$select public.mutate_ledger_record(
      '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002',
      'ledger-unauthorized', 'category', 'create', null, null, 'unauthorized-hash',
      '{"name":"Unauthorized","kind":"expense"}'::jsonb, '[]'::jsonb
    )$$,
  'P0001', 'Not authorized to change ledger records', 'service function re-verifies the actor role'
);

select * from finish();
rollback;
