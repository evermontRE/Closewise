-- Security operations: durable throttling, privacy requests, and credential destruction.
begin;

create table public.api_rate_limits (
  bucket_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  primary key (bucket_key, window_started_at)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_now timestamptz:=clock_timestamp(); v_window timestamptz; v_count integer;
begin
  if length(p_bucket_key)<10 or length(p_bucket_key)>300 or p_limit<1 or p_limit>10000 or p_window_seconds<1 or p_window_seconds>86400 then
    raise exception 'Invalid rate-limit configuration';
  end if;
  v_window:=to_timestamp(floor(extract(epoch from v_now)/p_window_seconds)*p_window_seconds);
  insert into public.api_rate_limits(bucket_key,window_started_at,request_count,expires_at)
  values(p_bucket_key,v_window,1,v_window+make_interval(secs=>p_window_seconds*2))
  on conflict(bucket_key,window_started_at) do update set request_count=api_rate_limits.request_count+1
  returning request_count into v_count;
  return jsonb_build_object('allowed',v_count<=p_limit,'remaining',greatest(0,p_limit-v_count),'retryAfterSeconds',greatest(1,ceil(extract(epoch from (v_window+make_interval(secs=>p_window_seconds)-v_now)))::integer));
end; $$;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  request_type text not null check(request_type in ('access','export','correction','deletion','restriction')),
  status text not null default 'received' check(status in ('received','identity_verification','in_progress','completed','denied','canceled')),
  request_details text,
  resolution_notes text,
  submitted_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.privacy_requests enable row level security;
create policy "requesters read own privacy requests" on public.privacy_requests for select using(auth.uid()=requester_id);
revoke all on public.privacy_requests from public,anon,authenticated;
grant select on public.privacy_requests to authenticated;
create index privacy_requests_status_time_idx on public.privacy_requests(status,submitted_at);

alter table public.bank_connections alter column access_token_ciphertext drop not null;
alter table public.bank_connections add column if not exists disconnected_at timestamptz;

create or replace function public.finalize_bank_disconnection(p_connection_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_workspace_id uuid; v_institution_name text;
begin
  select workspace_id,institution_name into v_workspace_id,v_institution_name from public.bank_connections where id=p_connection_id for update;
  if v_workspace_id is null then raise exception 'Bank connection not found'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=v_workspace_id and user_id=p_actor_id and role in ('owner','admin')) then
    raise exception 'Only workspace owners and administrators can disconnect banks';
  end if;
  update public.bank_connections set access_token_ciphertext=null,sync_cursor=null,status='disconnected',error_code=null,error_message=null,disconnected_at=now(),updated_at=now() where id=p_connection_id;
  update public.bank_accounts set is_active=false,updated_at=now() where connection_id=p_connection_id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)
  values(v_workspace_id,p_actor_id,'disconnect','bank_connection',p_connection_id,jsonb_build_object('provider','plaid','institutionName',v_institution_name,'credentialDestroyed',true),'plaid-disconnect:'||p_connection_id);
  return jsonb_build_object('id',p_connection_id,'status','disconnected','credentialDestroyed',true);
end; $$;
revoke all on function public.finalize_bank_disconnection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_bank_disconnection(uuid,uuid) to service_role;

create or replace function public.purge_expired_security_data()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_limits integer; v_webhooks integer;
begin
  delete from public.api_rate_limits where expires_at<now();
  get diagnostics v_limits=row_count;
  delete from public.bank_connection_events where received_at<now()-interval '90 days';
  get diagnostics v_webhooks=row_count;
  return jsonb_build_object('rateLimitRows',v_limits,'webhookRows',v_webhooks,'completedAt',now());
end; $$;
revoke all on function public.purge_expired_security_data() from public,anon,authenticated;
grant execute on function public.purge_expired_security_data() to service_role;

commit;
