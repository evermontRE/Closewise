begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select has_table('public', 'workspaces', 'workspaces table exists');
select has_table('public', 'workspace_members', 'workspace membership table exists');
select has_table('public', 'commissions', 'commissions table exists');
select has_table('public', 'commission_deductions', 'commission deductions table exists');
select has_table('public', 'transactions', 'transactions table exists');
select has_table('public', 'audit_events', 'audit events table exists');
select has_table('public', 'sync_operations', 'sync operation receipts table exists');

select has_column('public', 'commissions', 'commission_rate_pct', 'commission rate is stored');
select has_column('public', 'commissions', 'flat_commission', 'flat commission is stored');
select has_column('public', 'commissions', 'suggested_tax_reserve', 'tax reserve result is stored');
select has_column('public', 'commissions', 'calculation_version', 'calculation version is stored');

select has_function(
  'public',
  'is_workspace_member',
  array['uuid'],
  'workspace membership helper exists'
);
select has_function(
  'public',
  'create_commission_record',
  array['uuid', 'uuid', 'text', 'jsonb', 'jsonb'],
  'atomic commission function exists'
);
select has_function(
  'public',
  'workspace_financial_summary',
  array['uuid', 'integer'],
  'workspace summary function exists'
);
select is_definer(
  'public',
  'create_commission_record',
  array['uuid', 'uuid', 'text', 'jsonb', 'jsonb'],
  'commission creation function is security definer'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.commissions'::regclass
  ),
  'commissions enforce row level security'
);

select * from finish();
rollback;
