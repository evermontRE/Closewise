-- Finance domain foundation for Closewise / Finance Studio SaaS.
-- Keeps billing subscriptions separate from recurring business expenses.
-- Apply after 0001_init.sql.

begin;

-- Expand workspace roles without changing existing owner/member rows.
alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'member', 'bookkeeper', 'accountant'));

-- Security-definer membership helpers prevent recursive workspace_members RLS.
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(
  target_workspace_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

-- Replace recursive membership policies from the initial scaffold.
drop policy if exists "workspaces: members can read" on public.workspaces;
drop policy if exists "workspace_members: members can read own workspace roster" on public.workspace_members;
drop policy if exists "subscriptions: members can read" on public.subscriptions;

create policy "workspaces: members can read" on public.workspaces
  for select using (public.is_workspace_member(id));

create policy "workspace_members: members can read workspace roster"
  on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

create policy "workspace_members: owners manage roster"
  on public.workspace_members
  for all
  using (public.has_workspace_role(workspace_id, array['owner','admin']))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "subscriptions: members can read" on public.subscriptions
  for select using (public.is_workspace_member(workspace_id));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  legal_name text,
  brokerage_name text,
  tax_year integer not null default extract(year from current_date)::integer,
  currency text not null default 'USD',
  timezone text not null default 'America/New_York',
  opening_cash_balance numeric(14,2) not null default 0,
  opening_tax_reserve_balance numeric(14,2) not null default 0,
  default_commission_rate numeric(7,4) not null default 0,
  default_brokerage_split_pct numeric(7,4) not null default 0,
  default_team_split_pct numeric(7,4) not null default 0,
  default_tax_reserve_pct numeric(7,4) not null default 0,
  mileage_rate numeric(8,4) not null default 0.725,
  tax_assumptions jsonb not null default '{}'::jsonb,
  feature_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency ~ '^[A-Z]{3}$')
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  source text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  address_line_1 text not null,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country text not null default 'US',
  normalized_address text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  schedule_c_line text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, name, kind)
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  transaction_reference text,
  side text check (side in ('buyer','seller','dual','referral','other')),
  status text not null default 'pending'
    check (status in ('lead','under_contract','pending','closed','canceled','void')),
  lead_source text,
  contract_date date,
  expected_closing_date date,
  closed_date date,
  sales_price numeric(14,2) not null default 0 check (sales_price >= 0),
  gross_commission numeric(14,2) not null default 0 check (gross_commission >= 0),
  net_received numeric(14,2) not null default 0 check (net_received >= 0),
  hours_invested numeric(10,2) not null default 0 check (hours_invested >= 0),
  notes text,
  void_reason text,
  voided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.commission_deductions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  commission_id uuid not null references public.commissions(id) on delete cascade,
  kind text not null check (kind in ('brokerage_split','team_split','referral_fee','franchise_fee','transaction_fee','desk_fee','other')),
  label text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  commission_id uuid references public.commissions(id) on delete set null,
  transaction_date date not null,
  type text not null check (type in ('income','expense','owner_contribution','owner_draw','transfer','refund','reimbursement')),
  payee text,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  payment_method text,
  vendor_tax_id_last4 text,
  receipt_status text not null default 'none' check (receipt_status in ('none','attached','missing','not_required')),
  source text not null default 'manual' check (source in ('manual','bank_import','offline_import','system')),
  notes text,
  void_reason text,
  voided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  memo text,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  institution_name text,
  account_name text not null,
  account_type text not null check (account_type in ('checking','savings','credit_card','loan','other')),
  mask text,
  currency text not null default 'USD',
  connection_provider text,
  provider_account_id text,
  last_reconciled_through date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, connection_provider, provider_account_id)
);

create table public.bank_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  file_name text,
  file_hash text not null,
  imported_by uuid references auth.users(id) on delete set null,
  row_count integer not null default 0 check (row_count >= 0),
  imported_at timestamptz not null default now(),
  unique (workspace_id, file_hash)
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  bank_import_id uuid references public.bank_imports(id) on delete set null,
  provider_transaction_id text,
  fingerprint text not null,
  posted_date date not null,
  description text not null,
  amount numeric(14,2) not null,
  status text not null default 'new' check (status in ('new','categorized','matched','reconciled','ignored')),
  merchant_name text,
  raw_data jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, fingerprint)
);

create table public.bank_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  commission_id uuid references public.commissions(id) on delete cascade,
  matched_by uuid references auth.users(id) on delete set null,
  matched_at timestamptz not null default now(),
  check ((transaction_id is not null)::int + (commission_id is not null)::int = 1),
  unique (bank_transaction_id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  make text,
  model text,
  year integer,
  beginning_odometer numeric(12,1),
  ending_odometer numeric(12,1),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  trip_date date not null,
  purpose text not null,
  start_location text,
  end_location text,
  miles numeric(12,2) not null default 0 check (miles >= 0),
  mileage_rate numeric(8,4) not null default 0.725 check (mileage_rate >= 0),
  parking numeric(14,2) not null default 0 check (parking >= 0),
  tolls numeric(14,2) not null default 0 check (tolls >= 0),
  notes text,
  void_reason text,
  voided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  vendor_name text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  cadence text not null check (cadence in ('weekly','monthly','quarterly','semiannual','annual')),
  next_due_date date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tax_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payment_date date not null,
  tax_year integer not null,
  quarter integer check (quarter between 1 and 4),
  jurisdiction text not null default 'federal',
  amount numeric(14,2) not null check (amount >= 0),
  confirmation_reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tax_reserve_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  movement_date date not null,
  direction text not null check (direction in ('deposit','withdrawal')),
  amount numeric(14,2) not null check (amount >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  year integer not null,
  gci_target numeric(14,2) not null default 0,
  net_income_target numeric(14,2) not null default 0,
  closed_transactions_target integer not null default 0,
  tax_reserve_target numeric(14,2) not null default 0,
  marketing_budget numeric(14,2) not null default 0,
  target_expense_ratio_pct numeric(7,4) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, year)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  year integer not null,
  name text not null default 'Operating budget',
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, year, name)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  month integer not null check (month between 1 and 12),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_id, category_id, month)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  sha256 text,
  record_type text not null,
  record_id uuid not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, storage_path)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  occurred_at timestamptz not null default now()
);

create table public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  device_id text not null,
  client_mutation_id text not null,
  entity_type text not null,
  entity_id uuid,
  operation text not null check (operation in ('create','update','void','restore')),
  base_version bigint,
  result_version bigint,
  payload_hash text,
  status text not null default 'applied' check (status in ('applied','conflict','rejected')),
  conflict_data jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, client_mutation_id)
);

-- Update timestamps and optimistic-concurrency versions.
create or replace function public.bump_record_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients','properties','categories','commissions','commission_deductions',
    'transactions','transaction_splits','bank_accounts','bank_transactions',
    'vehicles','mileage_trips','recurring_expenses','tax_payments',
    'tax_reserve_movements','goals','budgets','budget_lines'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.bump_record_version()',
      table_name || '_version_trigger',
      table_name
    );
  end loop;
end $$;

create trigger workspace_settings_updated_at
  before update on public.workspace_settings
  for each row execute function public.set_updated_at();

-- Tenant isolation. Accountants are read-only; members and bookkeepers can
-- change financial records. Hard-delete policies are deliberately omitted.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients','properties','categories','commissions','commission_deductions',
    'transactions','transaction_splits','bank_accounts','bank_imports',
    'bank_transactions','bank_matches','vehicles','mileage_trips',
    'recurring_expenses','tax_payments','tax_reserve_movements','goals',
    'budgets','budget_lines','attachments','sync_operations'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "members read" on public.%I for select using (public.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "financial writers insert" on public.%I for insert with check (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''member'',''bookkeeper'']))',
      table_name
    );
    execute format(
      'create policy "financial writers update" on public.%I for update using (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''member'',''bookkeeper''])) with check (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''member'',''bookkeeper'']))',
      table_name
    );
  end loop;
end $$;

alter table public.workspace_settings enable row level security;
create policy "members read settings" on public.workspace_settings
  for select using (public.is_workspace_member(workspace_id));
create policy "owners manage settings" on public.workspace_settings
  for all
  using (public.has_workspace_role(workspace_id, array['owner','admin']))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));

alter table public.audit_events enable row level security;
create policy "members read audit" on public.audit_events
  for select using (public.is_workspace_member(workspace_id));
-- Audit inserts will be performed by trusted server code or database triggers.
-- No client update/delete policies are intentionally provided.

-- Core lookup and reporting indexes.
create index clients_workspace_active_idx on public.clients(workspace_id, updated_at desc) where deleted_at is null;
create index properties_workspace_active_idx on public.properties(workspace_id, updated_at desc) where deleted_at is null;
create index commissions_workspace_status_date_idx on public.commissions(workspace_id, status, expected_closing_date) where deleted_at is null;
create index transactions_workspace_date_idx on public.transactions(workspace_id, transaction_date desc) where deleted_at is null;
create index transactions_workspace_category_idx on public.transactions(workspace_id, category_id, transaction_date) where deleted_at is null;
create index bank_transactions_workspace_status_idx on public.bank_transactions(workspace_id, status, posted_date desc) where deleted_at is null;
create index mileage_trips_workspace_date_idx on public.mileage_trips(workspace_id, trip_date desc) where deleted_at is null;
create index audit_events_workspace_time_idx on public.audit_events(workspace_id, occurred_at desc);
create index sync_operations_workspace_time_idx on public.sync_operations(workspace_id, created_at desc);

commit;
