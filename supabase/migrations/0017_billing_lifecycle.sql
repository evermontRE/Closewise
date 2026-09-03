-- Stripe billing lifecycle, webhook idempotency, and auditable entitlement state.
begin;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists trial_end timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists grace_period_end timestamptz,
  add column if not exists checkout_started_at timestamptz,
  add column if not exists last_invoice_status text,
  add column if not exists stripe_event_created_at timestamptz;

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  attempts integer not null default 1 check (attempts > 0),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_event_id text not null references public.stripe_webhook_events(event_id),
  event_type text not null,
  subscription_status text not null,
  plan text check (plan in ('essentials','professional','complete')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (stripe_event_id, workspace_id)
);

alter table public.stripe_webhook_events enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
revoke all on public.billing_events from public, anon, authenticated;
grant select on public.billing_events to authenticated;

create policy "billing events: billing administrators can read"
  on public.billing_events for select
  using (public.has_workspace_role(workspace_id, array['owner','admin']));

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_claimed boolean := false;
begin
  insert into public.stripe_webhook_events(event_id,event_type,livemode)
  values(p_event_id,p_event_type,p_livemode)
  on conflict(event_id) do update set
    status='processing', attempts=stripe_webhook_events.attempts+1,
    error_message=null, received_at=now(), processed_at=null
  where stripe_webhook_events.status='failed'
     or (stripe_webhook_events.status='processing' and stripe_webhook_events.received_at < now()-interval '5 minutes')
  returning true into v_claimed;
  return coalesce(v_claimed,false);
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text,
  p_succeeded boolean,
  p_error_message text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.stripe_webhook_events set
    status=case when p_succeeded then 'completed' else 'failed' end,
    error_message=case when p_succeeded then null else left(coalesce(p_error_message,'Processing failed'),500) end,
    processed_at=now()
  where event_id=p_event_id;
end;
$$;

create or replace function public.claim_billing_checkout(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_claimed boolean := false;
begin
  update public.subscriptions set status='incomplete',checkout_started_at=now(),updated_at=now()
  where workspace_id=p_workspace_id and (
    status in ('none','canceled')
    or (status='incomplete' and stripe_subscription_id is null and (checkout_started_at is null or checkout_started_at < now()-interval '30 minutes'))
  ) returning true into v_claimed;
  return coalesce(v_claimed,false);
end;
$$;

create or replace function public.apply_stripe_subscription_snapshot(
  p_workspace_id uuid,
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_plan text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_trial_end timestamptz,
  p_canceled_at timestamptz,
  p_grace_period_end timestamptz,
  p_last_invoice_status text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_updated integer;
begin
  if p_plan is not null and p_plan not in ('essentials','professional','complete') then raise exception 'Unknown billing plan'; end if;
  if p_status not in ('active','trialing','past_due','canceled','incomplete','none') then raise exception 'Unknown subscription status'; end if;

  update public.workspaces set stripe_customer_id=coalesce(stripe_customer_id,p_customer_id)
  where id=p_workspace_id and (stripe_customer_id is null or stripe_customer_id=p_customer_id);
  if not found then raise exception 'Stripe customer does not match workspace'; end if;

  update public.subscriptions set
    stripe_subscription_id=p_subscription_id,
    stripe_price_id=p_price_id,
    plan=p_plan,
    status=p_status,
    current_period_end=p_current_period_end,
    cancel_at_period_end=p_cancel_at_period_end,
    trial_end=p_trial_end,
    canceled_at=p_canceled_at,
    grace_period_end=p_grace_period_end,
    last_invoice_status=coalesce(p_last_invoice_status,last_invoice_status),
    stripe_event_created_at=p_event_created_at,
    updated_at=now()
  where workspace_id=p_workspace_id
    and (stripe_event_created_at is null or stripe_event_created_at <= p_event_created_at);
  get diagnostics v_updated=row_count;

  if v_updated=1 then
    insert into public.billing_events(workspace_id,stripe_event_id,event_type,subscription_status,plan,occurred_at)
    values(p_workspace_id,p_event_id,p_event_type,p_status,p_plan,p_event_created_at)
    on conflict(stripe_event_id,workspace_id) do nothing;
  end if;
  return jsonb_build_object('applied',v_updated=1);
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text,text,boolean) from public, anon, authenticated;
revoke all on function public.claim_billing_checkout(uuid) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text,boolean,text) from public, anon, authenticated;
revoke all on function public.apply_stripe_subscription_snapshot(uuid,text,text,timestamptz,text,text,text,text,text,timestamptz,boolean,timestamptz,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text,text,boolean) to service_role;
grant execute on function public.claim_billing_checkout(uuid) to service_role;
grant execute on function public.complete_stripe_webhook_event(text,boolean,text) to service_role;
grant execute on function public.apply_stripe_subscription_snapshot(uuid,text,text,timestamptz,text,text,text,text,text,timestamptz,boolean,timestamptz,timestamptz,timestamptz,text) to service_role;

commit;
