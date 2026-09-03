-- Customer onboarding state for the first-run SaaS experience.
begin;

create table public.workspace_onboarding (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  current_step integer not null default 1 check (current_step between 1 and 4),
  business_type text check (business_type in ('solo_agent','team','brokerage','other')),
  tax_year integer check (tax_year between 2000 and 2200),
  opening_balance_cents bigint check (opening_balance_cents >= 0),
  setup_method text check (setup_method in ('bank','import','manual','later')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_onboarding enable row level security;
grant select, insert, update on public.workspace_onboarding to authenticated;

create policy "workspace onboarding: members can read"
  on public.workspace_onboarding for select
  using (public.has_workspace_role(workspace_id, array['owner','admin','member','bookkeeper','accountant']));

create policy "workspace onboarding: administrators can create"
  on public.workspace_onboarding for insert
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "workspace onboarding: administrators can update"
  on public.workspace_onboarding for update
  using (public.has_workspace_role(workspace_id, array['owner','admin']))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));

commit;
