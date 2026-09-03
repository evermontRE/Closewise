-- Platform staff operations with least privilege, reasons, and immutable audit history.
begin;

create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','support','auditor')),
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.workspace_operational_status (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended')),
  reason text,
  suspended_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status='active' or (reason is not null and length(trim(reason))>=10))
);

create table public.support_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (length(trim(note)) between 2 and 2000),
  reason text not null check (length(trim(reason)) between 10 and 500),
  created_at timestamptz not null default now()
);

create table public.support_review_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete restrict,
  access_level text not null default 'operational_read_only' check (access_level='operational_read_only'),
  reason text not null check (length(trim(reason)) between 10 and 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  ended_at timestamptz,
  check (expires_at>started_at and expires_at<=started_at+interval '30 minutes')
);

create unique index support_review_one_active_per_staff_idx
  on public.support_review_sessions(staff_id)
  where ended_at is null;

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete set null,
  request_id text not null unique check (length(request_id) between 8 and 200),
  action text not null check (action in ('add_note','suspend','reactivate','start_review','end_review')),
  reason text not null check (length(trim(reason)) between 10 and 500),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_workspace_time_idx on public.platform_audit_events(workspace_id,created_at desc);
create index support_notes_workspace_time_idx on public.support_notes(workspace_id,created_at desc);

alter table public.platform_staff enable row level security;
alter table public.workspace_operational_status enable row level security;
alter table public.support_notes enable row level security;
alter table public.support_review_sessions enable row level security;
alter table public.platform_audit_events enable row level security;

revoke all on public.platform_staff,public.workspace_operational_status,public.support_notes,public.support_review_sessions,public.platform_audit_events from public,anon,authenticated;
grant select on public.workspace_operational_status to authenticated;

create policy "workspace members read operational status"
  on public.workspace_operational_status for select
  using (public.is_workspace_member(workspace_id));

create or replace function public.mutate_platform_support(
  p_actor_id uuid,
  p_request_id text,
  p_workspace_id uuid,
  p_action text,
  p_reason text,
  p_note text default null,
  p_session_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_result_id uuid;
  v_existing public.platform_audit_events%rowtype;
begin
  if length(coalesce(p_request_id,''))<8 or length(p_request_id)>200 then raise exception 'A stable request identifier is required'; end if;
  if length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>500 then raise exception 'A meaningful support reason is required'; end if;
  if p_action not in ('add_note','suspend','reactivate','start_review','end_review') then raise exception 'Unsupported support action'; end if;
  if not exists(select 1 from public.workspaces where id=p_workspace_id) then raise exception 'Workspace not found'; end if;

  select role into v_role from public.platform_staff where user_id=p_actor_id and is_active=true;
  if v_role is null then raise exception 'Active platform staff access is required'; end if;
  if v_role='auditor' then raise exception 'Auditor access is read-only'; end if;
  if p_action in ('suspend','reactivate') and v_role<>'admin' then raise exception 'Only platform administrators can change workspace status'; end if;

  select * into v_existing from public.platform_audit_events where request_id=p_request_id;
  if found then
    if v_existing.actor_id<>p_actor_id or v_existing.workspace_id<>p_workspace_id or v_existing.action<>p_action then
      raise exception 'Request identifier was already used for another operation';
    end if;
    return jsonb_build_object('id',v_existing.after_data->>'noteId','action',v_existing.action,'workspaceId',v_existing.workspace_id,'result',v_existing.after_data,'duplicate',true);
  end if;

  select jsonb_build_object('status',status,'reason',reason,'updatedAt',updated_at)
    into v_before from public.workspace_operational_status where workspace_id=p_workspace_id;

  if p_action='add_note' then
    if length(trim(coalesce(p_note,'')))<2 or length(p_note)>2000 then raise exception 'A valid internal note is required'; end if;
    insert into public.support_notes(workspace_id,author_id,note,reason)
    values(p_workspace_id,p_actor_id,trim(p_note),trim(p_reason)) returning id into v_result_id;
    v_after:=jsonb_build_object('noteId',v_result_id);
  elsif p_action='suspend' then
    insert into public.workspace_operational_status(workspace_id,status,reason,suspended_by,suspended_at,updated_at)
    values(p_workspace_id,'suspended',trim(p_reason),p_actor_id,now(),now())
    on conflict(workspace_id) do update set status='suspended',reason=excluded.reason,suspended_by=p_actor_id,suspended_at=now(),updated_at=now();
    select jsonb_build_object('status',status,'reason',reason,'updatedAt',updated_at)
      into v_after from public.workspace_operational_status where workspace_id=p_workspace_id;
  elsif p_action='reactivate' then
    insert into public.workspace_operational_status(workspace_id,status,reason,suspended_by,suspended_at,updated_at)
    values(p_workspace_id,'active',null,null,null,now())
    on conflict(workspace_id) do update set status='active',reason=null,suspended_by=null,suspended_at=null,updated_at=now();
    select jsonb_build_object('status',status,'reason',reason,'updatedAt',updated_at)
      into v_after from public.workspace_operational_status where workspace_id=p_workspace_id;
  elsif p_action='start_review' then
    update public.support_review_sessions set ended_at=now() where staff_id=p_actor_id and ended_at is null;
    insert into public.support_review_sessions(workspace_id,staff_id,reason)
    values(p_workspace_id,p_actor_id,trim(p_reason)) returning id into v_result_id;
    v_after:=jsonb_build_object('reviewSessionId',v_result_id,'accessLevel','operational_read_only','expiresInMinutes',30);
  else
    update public.support_review_sessions set ended_at=now()
      where id=p_session_id and workspace_id=p_workspace_id and staff_id=p_actor_id and ended_at is null
      returning id into v_result_id;
    if v_result_id is null then raise exception 'Active support review session not found'; end if;
    v_after:=jsonb_build_object('reviewSessionId',v_result_id,'ended',true);
  end if;

  insert into public.platform_audit_events(actor_id,workspace_id,request_id,action,reason,before_data,after_data)
  values(p_actor_id,p_workspace_id,p_request_id,p_action,trim(p_reason),v_before,v_after)
  on conflict(request_id) do nothing;

  return jsonb_build_object('id',v_result_id,'action',p_action,'workspaceId',p_workspace_id,'result',v_after);
end;
$$;

revoke all on function public.mutate_platform_support(uuid,text,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.mutate_platform_support(uuid,text,uuid,text,text,text,uuid) to service_role;

commit;
