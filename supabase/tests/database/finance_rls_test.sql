begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'owner-a@example.test', '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'accountant-a@example.test', '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000003', 'owner-b@example.test', '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000004', 'outsider@example.test', '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, owner_id)
values
  ('20000000-0000-4000-8000-000000000001', 'Workspace A', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Workspace B', '10000000-0000-4000-8000-000000000003');

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'accountant'
);

insert into public.clients (id, workspace_id, display_name, created_by)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Workspace A client',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'Workspace B client',
    '10000000-0000-4000-8000-000000000003'
  );

insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'create',
  'client',
  '30000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  'select id from public.workspaces order by id',
  $$values ('20000000-0000-4000-8000-000000000001'::uuid)$$,
  'owner sees only their workspace'
);
select results_eq(
  'select id from public.clients order by id',
  $$values ('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'owner sees only clients in their workspace'
);
select results_eq(
  'select user_id from public.workspace_members order by user_id',
  $$values
    ('10000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000002'::uuid)$$,
  'owner sees only their workspace roster'
);
select is(
  (select count(*)::integer from public.audit_events),
  1,
  'owner can read workspace audit events'
);
select lives_ok(
  $$insert into public.clients (workspace_id, display_name)
    values ('20000000-0000-4000-8000-000000000001', 'Owner-created client')$$,
  'owner can create a client in their workspace'
);
select throws_ok(
  $$insert into public.clients (workspace_id, display_name)
    values ('20000000-0000-4000-8000-000000000002', 'Cross-tenant client')$$,
  '42501',
  null,
  'owner cannot create a client in another workspace'
);
select is_empty(
  $$delete from public.clients
    where id = '30000000-0000-4000-8000-000000000001'
    returning id$$,
  'authenticated clients cannot hard-delete financial records'
);
select throws_ok(
  $$insert into public.audit_events (workspace_id, action, entity_type)
    values ('20000000-0000-4000-8000-000000000001', 'tamper', 'client')$$,
  '42501',
  null,
  'authenticated clients cannot write audit events'
);
select is(
  (public.workspace_financial_summary('20000000-0000-4000-8000-000000000001', 2026) ->> 'year')::integer,
  2026,
  'owner can calculate their workspace summary'
);
select throws_ok(
  $$select public.create_commission_record(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'client-request-001',
      '{}'::jsonb,
      '[]'::jsonb
    )$$,
  '42501',
  null,
  'authenticated clients cannot call the service-role commission function'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.clients),
  2,
  'accountant can read workspace clients'
);
select throws_ok(
  $$insert into public.clients (workspace_id, display_name)
    values ('20000000-0000-4000-8000-000000000001', 'Accountant-created client')$$,
  '42501',
  null,
  'accountant cannot create financial records'
);
select is_empty(
  $$update public.clients
    set display_name = 'Accountant edit'
    where id = '30000000-0000-4000-8000-000000000001'
    returning id$$,
  'accountant cannot update financial records'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select is_empty(
  'select id from public.workspaces',
  'outsider cannot discover workspaces'
);
select is_empty(
  'select id from public.clients',
  'outsider cannot discover financial records'
);
select throws_ok(
  $$select public.workspace_financial_summary(
      '20000000-0000-4000-8000-000000000001',
      2026
    )$$,
  'P0001',
  'Workspace not found or not a member',
  'outsider cannot calculate another workspace summary'
);

reset role;

create temporary table commission_result as
select public.create_commission_record(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'server-request-001',
  jsonb_build_object(
    'side', 'buyer',
    'status', 'paid',
    'salesPrice', '500000.00',
    'commissionRatePct', '3',
    'flatCommission', '0.00',
    'grossCommission', '15000.00',
    'referralPct', '0',
    'brokerageSplitPct', '20',
    'teamSplitPct', '0',
    'taxReservePct', '30',
    'suggestedTaxReserve', '3600.00',
    'netReceived', '12000.00',
    'hoursInvested', '10',
    'closedDate', '2026-08-31',
    'calculationVersion', 'finance-v1',
    'deviceId', 'database-test',
    'payloadHash', 'same-content'
  ),
  '[{"kind":"brokerage_split","label":"Brokerage split","amount":"3000.00"}]'::jsonb
) as id;

select is(
  public.create_commission_record(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'server-request-001',
    '{"payloadHash":"same-content"}'::jsonb,
    '[]'::jsonb
  ),
  (select id from commission_result),
  'repeating identical content returns the original commission'
);
select throws_ok(
  $$select public.create_commission_record(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'server-request-001',
      '{"payloadHash":"different-content"}'::jsonb,
      '[]'::jsonb
    )$$,
  'P0001',
  'Idempotency key was already used for different content',
  'an idempotency key cannot be reused for different content'
);
select throws_ok(
  $$select public.create_commission_record(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000004',
      'server-request-unauthorized',
      '{}'::jsonb,
      '[]'::jsonb
    )$$,
  'P0001',
  'Not authorized to create financial records',
  'service function re-verifies the actor workspace role'
);

select is(
  (select count(*)::integer from public.commissions where workspace_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'trusted commission creation writes one commission'
);
select is(
  (select count(*)::integer from public.commission_deductions where workspace_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'trusted commission creation writes itemized deductions'
);
select is(
  (select count(*)::integer from public.sync_operations where client_mutation_id = 'server-request-001'),
  1,
  'trusted commission creation writes an idempotency receipt'
);
select is(
  (select count(*)::integer from public.audit_events where request_id = 'server-request-001'),
  1,
  'trusted commission creation writes an audit event'
);

select * from finish();
rollback;
