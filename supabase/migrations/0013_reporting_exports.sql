-- Append-only report export history and service-only export recording.
begin;
create table public.export_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id)on delete cascade,
 requested_by uuid references auth.users(id)on delete set null,request_id text not null,report_type text not null check(report_type in('pl','income-expense','categories','cashflow','commissions','quarterly-organizer','schedule-c')),
 export_format text not null check(export_format in('csv','spreadsheet','pdf-data')),period_from date not null,period_to date not null,row_count integer not null check(row_count>=0),
 content_sha256 text not null check(content_sha256~'^[0-9a-f]{64}$'),filters jsonb not null default'{}',status text not null default'completed'check(status in('completed','failed')),created_at timestamptz not null default now(),
 unique(workspace_id,request_id),check(period_to>=period_from)
);
alter table public.export_events enable row level security;create policy "members read export history"on public.export_events for select using(public.is_workspace_member(workspace_id));create index export_events_workspace_time_idx on public.export_events(workspace_id,created_at desc);
create or replace function public.prevent_export_event_change()returns trigger language plpgsql set search_path=public as $$begin raise exception 'Export history is append-only';end;$$;create trigger export_events_append_only before update or delete on public.export_events for each row execute function public.prevent_export_event_change();
create or replace function public.record_export_event(p_workspace_id uuid,p_actor_id uuid,p_request_id text,p_report_type text,p_export_format text,p_period_from date,p_period_to date,p_row_count integer,p_content_sha256 text,p_filters jsonb)
returns uuid language plpgsql security definer set search_path=public as $$declare v_id uuid;begin
 if p_request_id is null or length(trim(p_request_id))<8 then raise exception 'A stable export request identifier is required';end if;
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id)then raise exception 'Not authorized to export this workspace';end if;
 select id into v_id from public.export_events where workspace_id=p_workspace_id and request_id=p_request_id;if v_id is not null then return v_id;end if;
 insert into public.export_events(workspace_id,requested_by,request_id,report_type,export_format,period_from,period_to,row_count,content_sha256,filters)values(p_workspace_id,p_actor_id,p_request_id,p_report_type,p_export_format,p_period_from,p_period_to,p_row_count,p_content_sha256,coalesce(p_filters,'{}'))returning id into v_id;
 insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,after_data,request_id)values(p_workspace_id,p_actor_id,'export','report_export',v_id,jsonb_build_object('reportType',p_report_type,'format',p_export_format,'periodFrom',p_period_from,'periodTo',p_period_to,'rowCount',p_row_count,'contentSha256',p_content_sha256),p_request_id);return v_id;
end;$$;
revoke all on function public.record_export_event(uuid,uuid,text,text,text,date,date,integer,text,jsonb)from public,authenticated;grant execute on function public.record_export_event(uuid,uuid,text,text,text,date,date,integer,text,jsonb)to service_role;
commit;
