-- Durable production health, maintenance, alert, and backup verification records.
begin;

create table public.maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  task_name text not null check (task_name in ('daily-production-maintenance')),
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  request_id text not null unique check (length(request_id) between 8 and 200),
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.service_health_checks (
  service text primary key check (service in ('application','database','stripe-webhooks','plaid-sync','backups')),
  status text not null check (status in ('healthy','degraded','unhealthy','unconfigured')),
  summary text not null check (length(summary) between 2 and 500),
  metrics jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create table public.operational_alerts (
  alert_key text primary key check (length(alert_key) between 4 and 200),
  service text not null,
  severity text not null check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','resolved')),
  summary text not null check (length(summary) between 2 and 500),
  occurrence_count integer not null default 1 check (occurrence_count>0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb
);

create table public.backup_verifications (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'supabase',
  backup_reference text not null check (length(backup_reference) between 4 and 200),
  verification_type text not null check (verification_type in ('backup_visible','restore_test')),
  status text not null check (status in ('passed','failed')),
  verified_by uuid references auth.users(id) on delete set null,
  backup_created_at timestamptz,
  verified_at timestamptz not null default now(),
  notes text check (notes is null or length(notes)<=1000),
  unique(provider,backup_reference,verification_type)
);

create index maintenance_runs_started_idx on public.maintenance_runs(started_at desc);
create index operational_alerts_status_severity_idx on public.operational_alerts(status,severity,last_seen_at desc);
create index backup_verifications_time_idx on public.backup_verifications(verified_at desc);

alter table public.maintenance_runs enable row level security;
alter table public.service_health_checks enable row level security;
alter table public.operational_alerts enable row level security;
alter table public.backup_verifications enable row level security;
revoke all on public.maintenance_runs,public.service_health_checks,public.operational_alerts,public.backup_verifications from public,anon,authenticated;

create or replace function public.claim_maintenance_run(p_request_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if length(coalesce(p_request_id,''))<8 or length(p_request_id)>200 then raise exception 'A stable maintenance request identifier is required'; end if;
  insert into public.maintenance_runs(task_name,request_id) values('daily-production-maintenance',p_request_id)
  on conflict(request_id) do nothing returning id into v_id;
  return v_id;
end; $$;

create or replace function public.finish_maintenance_run(p_run_id uuid,p_succeeded boolean,p_metrics jsonb,p_error_message text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.maintenance_runs set status=case when p_succeeded then 'succeeded' else 'failed' end,
    metrics=coalesce(p_metrics,'{}'::jsonb),error_message=case when p_succeeded then null else left(coalesce(p_error_message,'Maintenance failed'),500) end,
    finished_at=now() where id=p_run_id and status='running';
end; $$;

create or replace function public.record_service_health(p_service text,p_status text,p_summary text,p_metrics jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_service not in ('application','database','stripe-webhooks','plaid-sync','backups') then raise exception 'Unsupported monitored service'; end if;
  if p_status not in ('healthy','degraded','unhealthy','unconfigured') then raise exception 'Unsupported health status'; end if;
  insert into public.service_health_checks(service,status,summary,metrics,checked_at)
  values(p_service,p_status,left(p_summary,500),coalesce(p_metrics,'{}'::jsonb),now())
  on conflict(service) do update set status=excluded.status,summary=excluded.summary,metrics=excluded.metrics,checked_at=now();
end; $$;

create or replace function public.set_operational_alert(p_alert_key text,p_service text,p_severity text,p_summary text,p_open boolean,p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if length(coalesce(p_alert_key,''))<4 or length(p_alert_key)>200 then raise exception 'Invalid alert key'; end if;
  if p_severity not in ('info','warning','critical') then raise exception 'Unsupported alert severity'; end if;
  insert into public.operational_alerts(alert_key,service,severity,status,summary,details,resolved_at)
  values(p_alert_key,p_service,p_severity,case when p_open then 'open' else 'resolved' end,left(p_summary,500),coalesce(p_details,'{}'::jsonb),case when p_open then null else now() end)
  on conflict(alert_key) do update set severity=excluded.severity,status=excluded.status,summary=excluded.summary,
    occurrence_count=case when p_open then operational_alerts.occurrence_count+1 else operational_alerts.occurrence_count end,
    last_seen_at=now(),resolved_at=case when p_open then null else now() end,details=excluded.details;
end; $$;

revoke all on function public.claim_maintenance_run(text) from public,anon,authenticated;
revoke all on function public.finish_maintenance_run(uuid,boolean,jsonb,text) from public,anon,authenticated;
revoke all on function public.record_service_health(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.set_operational_alert(text,text,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.claim_maintenance_run(text) to service_role;
grant execute on function public.finish_maintenance_run(uuid,boolean,jsonb,text) to service_role;
grant execute on function public.record_service_health(text,text,text,jsonb) to service_role;
grant execute on function public.set_operational_alert(text,text,text,text,boolean,jsonb) to service_role;

commit;
