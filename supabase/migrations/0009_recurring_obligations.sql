-- Recurring business expenses and subscription-renewal obligations.
-- Apply after 0008_mileage_workflow.sql.
begin;

alter table public.recurring_expenses
  add column if not exists product_name text,
  add column if not exists purpose text,
  add column if not exists recurring_type text not null default 'subscription',
  add column if not exists annualized_amount numeric(14,2) not null default 0,
  add column if not exists auto_pay boolean not null default false,
  add column if not exists reminder_days integer not null default 7,
  add column if not exists website_url text,
  add column if not exists notes text,
  add column if not exists last_confirmed_date date,
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.recurring_expenses add constraint recurring_expenses_type_check check(recurring_type in('subscription','recurring_bill'));
alter table public.recurring_expenses add constraint recurring_expenses_positive_amount_check check(amount>0);
alter table public.recurring_expenses add constraint recurring_expenses_reminder_check check(reminder_days between 0 and 90);
alter table public.recurring_expenses add constraint recurring_expenses_annualized_check check(annualized_amount>=amount);

create table public.recurring_expense_renewals(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recurring_expense_id uuid not null references public.recurring_expenses(id) on delete cascade,
  due_date date not null,
  confirmed_date date not null,
  amount numeric(14,2) not null check(amount>0),
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(recurring_expense_id,due_date)
);
alter table public.recurring_expense_renewals enable row level security;
create policy "members read recurring renewals" on public.recurring_expense_renewals for select using(public.is_workspace_member(workspace_id));
create index recurring_expenses_workspace_due_idx on public.recurring_expenses(workspace_id,next_due_date) where deleted_at is null and is_active;
create index recurring_renewals_workspace_date_idx on public.recurring_expense_renewals(workspace_id,due_date desc);

create or replace function public.advance_recurring_date(p_date date,p_cadence text)
returns date language sql immutable strict set search_path=public as $$
  select case p_cadence when 'weekly' then p_date+7 when 'monthly' then(p_date+interval '1 month')::date
    when 'quarterly' then(p_date+interval '3 months')::date when 'semiannual' then(p_date+interval '6 months')::date
    when 'annual' then(p_date+interval '1 year')::date else null end
$$;

create or replace function public.mutate_recurring_expense(
  p_workspace_id uuid,p_actor_id uuid,p_client_mutation_id text,p_operation text,
  p_entity_id uuid,p_expected_version bigint,p_payload_hash text,p_record jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;v_version bigint;v_before jsonb;v_after jsonb;v_reason text;v_existing_hash text;v_existing_operation text;v_existing_version bigint;
  v_amount numeric(14,2);v_annual numeric(14,2);v_cadence text;v_due date;v_next_due date;v_confirmed date;
begin
  if p_client_mutation_id is null or length(trim(p_client_mutation_id))<8 then raise exception 'A stable client mutation identifier is required';end if;
  if p_operation not in('create','update','advance','void')then raise exception 'Unsupported recurring expense operation';end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in('owner','admin','member','bookkeeper'))then raise exception 'Not authorized to change recurring expenses';end if;
  select entity_id,payload_hash,operation,result_version into v_id,v_existing_hash,v_existing_operation,v_existing_version from public.sync_operations where workspace_id=p_workspace_id and client_mutation_id=p_client_mutation_id;
  if v_id is not null then if v_existing_hash is distinct from nullif(p_payload_hash,'')then raise exception 'Idempotency key was already used for different content';end if;return jsonb_build_object('id',v_id,'operation',v_existing_operation,'version',v_existing_version);end if;
  if p_operation<>'create'and(p_entity_id is null or p_expected_version is null)then raise exception 'Record identifier and expected version are required';end if;

  if p_operation in('create','update')then
    v_amount:=(p_record->>'amount')::numeric;v_cadence:=p_record->>'cadence';
    if v_amount<=0 then raise exception 'Recurring amount must be greater than zero';end if;
    v_annual:=round(v_amount*(case v_cadence when'weekly'then 52 when'monthly'then 12 when'quarterly'then 4 when'semiannual'then 2 when'annual'then 1 else 0 end),2);
    if v_annual<=0 then raise exception 'Unsupported recurring cadence';end if;
    if nullif(p_record->>'categoryId','')is not null and not exists(select 1 from public.categories where id=(p_record->>'categoryId')::uuid and workspace_id=p_workspace_id and kind='expense'and is_active and deleted_at is null)then raise exception 'Expense category is not available in this workspace';end if;
  end if;
  if p_operation='create'then
    insert into public.recurring_expenses(workspace_id,category_id,vendor_name,product_name,purpose,recurring_type,description,amount,cadence,annualized_amount,next_due_date,auto_pay,reminder_days,website_url,notes,is_active,created_by)
    values(p_workspace_id,nullif(p_record->>'categoryId','')::uuid,p_record->>'vendorName',nullif(p_record->>'productName',''),nullif(p_record->>'purpose',''),p_record->>'recurringType',nullif(p_record->>'purpose',''),v_amount,v_cadence,v_annual,(p_record->>'nextDueDate')::date,coalesce((p_record->>'autoPay')::boolean,false),(p_record->>'reminderDays')::integer,nullif(p_record->>'websiteUrl',''),nullif(p_record->>'notes',''),coalesce((p_record->>'isActive')::boolean,true),p_actor_id)
    returning id,version into v_id,v_version;
  else
    select to_jsonb(r.*)into v_before from public.recurring_expenses r where id=p_entity_id and workspace_id=p_workspace_id and deleted_at is null for update;
    if v_before is null then raise exception 'Record not found';end if;if(v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;
    if p_operation='update'then
      update public.recurring_expenses set category_id=nullif(p_record->>'categoryId','')::uuid,vendor_name=p_record->>'vendorName',product_name=nullif(p_record->>'productName',''),purpose=nullif(p_record->>'purpose',''),recurring_type=p_record->>'recurringType',description=nullif(p_record->>'purpose',''),amount=v_amount,cadence=v_cadence,annualized_amount=v_annual,next_due_date=(p_record->>'nextDueDate')::date,auto_pay=coalesce((p_record->>'autoPay')::boolean,false),reminder_days=(p_record->>'reminderDays')::integer,website_url=nullif(p_record->>'websiteUrl',''),notes=nullif(p_record->>'notes',''),is_active=coalesce((p_record->>'isActive')::boolean,true)where id=p_entity_id returning id,version into v_id,v_version;
    elsif p_operation='advance'then
      if not(v_before->>'is_active')::boolean then raise exception 'Inactive obligations cannot be confirmed';end if;
      v_due:=(v_before->>'next_due_date')::date;v_confirmed:=(p_record->>'paidDate')::date;v_next_due:=public.advance_recurring_date(v_due,v_before->>'cadence');
      insert into public.recurring_expense_renewals(workspace_id,recurring_expense_id,due_date,confirmed_date,amount,confirmed_by)values(p_workspace_id,p_entity_id,v_due,v_confirmed,(v_before->>'amount')::numeric,p_actor_id);
      update public.recurring_expenses set last_confirmed_date=v_confirmed,next_due_date=v_next_due where id=p_entity_id returning id,version into v_id,v_version;
    else
      v_reason:=nullif(trim(p_record->>'reason'),'');if v_reason is null or length(v_reason)<5 then raise exception 'A void reason is required';end if;
      update public.recurring_expenses set is_active=false,void_reason=v_reason,voided_at=now(),voided_by=p_actor_id,deleted_at=now()where id=p_entity_id returning id,version into v_id,v_version;
    end if;
  end if;
  select to_jsonb(r.*)into v_after from public.recurring_expenses r where id=v_id;
  insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)values(p_workspace_id,p_actor_id,coalesce(nullif(p_record->>'deviceId',''),'web'),p_client_mutation_id,'recurring_expense',v_id,case when p_operation='advance'then'update'else p_operation end,p_expected_version,v_version,nullif(p_payload_hash,''),'applied');
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,reason,before_data,after_data,request_id)values(p_workspace_id,p_actor_id,p_operation,'recurring_expense',v_id,v_reason,v_before,v_after,p_client_mutation_id);
  return jsonb_build_object('id',v_id,'operation',p_operation,'version',v_version,'nextDueDate',v_after->>'next_due_date');
end;$$;
revoke all on function public.advance_recurring_date(date,text)from public,authenticated;
grant execute on function public.advance_recurring_date(date,text)to service_role;
revoke all on function public.mutate_recurring_expense(uuid,uuid,text,text,uuid,bigint,text,jsonb)from public,authenticated;
grant execute on function public.mutate_recurring_expense(uuid,uuid,text,text,uuid,bigint,text,jsonb)to service_role;
commit;
