-- Closewise SaaS foundation: profiles, workspaces, membership, subscriptions.
-- Run in the Supabase SQL editor, or via `supabase db push`.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- One row per workspace, kept in sync by the Stripe webhook handler.
-- The app never writes this table directly; only the service-role client does.
create table if not exists public.subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text check (plan in ('essentials', 'professional', 'complete')),
  status text not null default 'none'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'none')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

create policy "workspaces: members can read" on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = id and m.user_id = auth.uid()
    )
  );

create policy "workspaces: owner can update" on public.workspaces
  for update using (owner_id = auth.uid());

create policy "workspaces: authenticated users can create" on public.workspaces
  for insert with check (owner_id = auth.uid());

create policy "workspace_members: members can read own workspace roster" on public.workspace_members
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_members.workspace_id and m.user_id = auth.uid()
    )
  );

create policy "subscriptions: members can read" on public.subscriptions
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = subscriptions.workspace_id and m.user_id = auth.uid()
    )
  );
-- No insert/update/delete policy on subscriptions: writes only happen via the
-- service-role client in the Stripe webhook handler, which bypasses RLS.

-- Auto-provision a profile row when someone signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Owning a workspace implies membership with the owner role.
create or replace function public.handle_new_workspace()
returns trigger as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  insert into public.subscriptions (workspace_id, status)
  values (new.id, 'none');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();
