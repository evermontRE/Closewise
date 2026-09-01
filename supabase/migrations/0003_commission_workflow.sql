-- First authenticated finance vertical: commission creation and summaries.
-- Apply after 0002_finance_domain.sql.

begin;

alter table public.commissions
  add column if not exists commission_rate_pct numeric(7,4) not null default 0,
  add column if not exists flat_commission numeric(14,2) not null default 0,
  add column if not exists referral_pct numeric(7,4) not null default 0,
  add column if not exists brokerage_split_pct numeric(7,4) not null default 0,
  add column if not exists team_split_pct numeric(7,4) not null default 0,
  add column if not exists tax_reserve_pct numeric(7,4) not null default 0,
  add column if not exists suggested_tax_reserve numeric(14,2) not null default 0,
  add column if not exists calculation_version text not null default 'finance-v1';

alter table public.commissions
  drop constraint if exists commissions_status_check;

alter table public.commissions
  add constraint commissions_status_check
  check (status in (
    'prospective', 'under_contract', 'pending', 'closed', 'paid',
    'fell_through', 'terminated', 'lost', 'canceled', 'void'
  ));

-- Called only by trusted server code after request authentication. The function
-- still verifies the actor's workspace role and performs the complete write in
-- one transaction. Direct browser execution is not granted.
create or replace function public.create_commission_record(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_client_mutation_id text,
  p_record jsonb,
  p_deductions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission_id uuid;
  v_existing_id uuid;
  v_existing_hash text;
  v_deduction jsonb;
begin
  if p_client_mutation_id is null or length(trim(p_client_mutation_id)) < 8 then
    raise exception 'A stable client mutation identifier is required';
  end if;

  if not exists (
    select 1
      from public.workspace_members
     where workspace_id = p_workspace_id
       and user_id = p_actor_id
       and role in ('owner', 'admin', 'member', 'bookkeeper')
  ) then
    raise exception 'Not authorized to create financial records';
  end if;

  select entity_id, payload_hash
    into v_existing_id, v_existing_hash
    from public.sync_operations
   where workspace_id = p_workspace_id
     and client_mutation_id = p_client_mutation_id;

  if v_existing_id is not null then
    if v_existing_hash is distinct from nullif(p_record ->> 'payloadHash', '') then
      raise exception 'Idempotency key was already used for different content';
    end if;
    return v_existing_id;
  end if;

  insert into public.commissions (
    workspace_id, client_id, property_id, transaction_reference, side, status,
    lead_source, contract_date, expected_closing_date, closed_date,
    sales_price, commission_rate_pct, flat_commission, gross_commission,
    referral_pct, brokerage_split_pct, team_split_pct, tax_reserve_pct,
    suggested_tax_reserve, net_received, hours_invested, notes,
    calculation_version, created_by
  ) values (
    p_workspace_id,
    nullif(p_record ->> 'clientId', '')::uuid,
    nullif(p_record ->> 'propertyId', '')::uuid,
    nullif(p_record ->> 'transactionReference', ''),
    nullif(p_record ->> 'side', ''),
    p_record ->> 'status',
    nullif(p_record ->> 'leadSource', ''),
    nullif(p_record ->> 'contractDate', '')::date,
    nullif(p_record ->> 'expectedClosingDate', '')::date,
    nullif(p_record ->> 'closedDate', '')::date,
    (p_record ->> 'salesPrice')::numeric,
    (p_record ->> 'commissionRatePct')::numeric,
    (p_record ->> 'flatCommission')::numeric,
    (p_record ->> 'grossCommission')::numeric,
    (p_record ->> 'referralPct')::numeric,
    (p_record ->> 'brokerageSplitPct')::numeric,
    (p_record ->> 'teamSplitPct')::numeric,
    (p_record ->> 'taxReservePct')::numeric,
    (p_record ->> 'suggestedTaxReserve')::numeric,
    (p_record ->> 'netReceived')::numeric,
    (p_record ->> 'hoursInvested')::numeric,
    nullif(p_record ->> 'notes', ''),
    p_record ->> 'calculationVersion',
    p_actor_id
  ) returning id into v_commission_id;

  for v_deduction in
    select value from jsonb_array_elements(coalesce(p_deductions, '[]'::jsonb))
  loop
    if (v_deduction ->> 'amount')::numeric > 0 then
      insert into public.commission_deductions (
        workspace_id, commission_id, kind, label, amount, created_by
      ) values (
        p_workspace_id,
        v_commission_id,
        v_deduction ->> 'kind',
        nullif(v_deduction ->> 'label', ''),
        (v_deduction ->> 'amount')::numeric,
        p_actor_id
      );
    end if;
  end loop;

  insert into public.sync_operations (
    workspace_id, user_id, device_id, client_mutation_id, entity_type,
    entity_id, operation, result_version, payload_hash, status
  ) values (
    p_workspace_id,
    p_actor_id,
    coalesce(nullif(p_record ->> 'deviceId', ''), 'web'),
    p_client_mutation_id,
    'commission',
    v_commission_id,
    'create',
    1,
    nullif(p_record ->> 'payloadHash', ''),
    'applied'
  );

  insert into public.audit_events (
    workspace_id, actor_id, action, entity_type, entity_id, request_id,
    after_data
  ) values (
    p_workspace_id,
    p_actor_id,
    'create',
    'commission',
    v_commission_id,
    p_client_mutation_id,
    jsonb_build_object(
      'status', p_record ->> 'status',
      'grossCommission', p_record ->> 'grossCommission',
      'netReceived', p_record ->> 'netReceived',
      'calculationVersion', p_record ->> 'calculationVersion'
    )
  );

  return v_commission_id;
end;
$$;

revoke all on function public.create_commission_record(uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.create_commission_record(uuid, uuid, text, jsonb, jsonb) from authenticated;
grant execute on function public.create_commission_record(uuid, uuid, text, jsonb, jsonb) to service_role;

-- Workspace-scoped server summary. RLS membership is checked explicitly so
-- callers receive no cross-tenant totals even if the function changes later.
create or replace function public.workspace_financial_summary(
  p_workspace_id uuid,
  p_year integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace not found or not a member';
  end if;

  with commission_totals as (
    select
      coalesce(sum(gross_commission) filter (
        where status in ('closed', 'paid')
          and extract(year from coalesce(closed_date, expected_closing_date)) = p_year
      ), 0) as gross_commission_income,
      coalesce(sum(net_received) filter (
        where status = 'paid'
          and extract(year from coalesce(closed_date, expected_closing_date)) = p_year
      ), 0) as net_commission_received,
      coalesce(sum(suggested_tax_reserve) filter (
        where status = 'paid'
          and extract(year from coalesce(closed_date, expected_closing_date)) = p_year
      ), 0) as suggested_tax_reserve,
      coalesce(sum(gross_commission) filter (
        where status in ('prospective', 'under_contract', 'pending')
      ), 0) as pending_gross_commission,
      coalesce(sum(net_received) filter (
        where status in ('prospective', 'under_contract', 'pending')
      ), 0) as pending_net_commission
    from public.commissions
    where workspace_id = p_workspace_id
      and deleted_at is null
      and voided_at is null
  ), transaction_totals as (
    select
      coalesce(sum(amount) filter (where type = 'income'), 0) as other_income,
      greatest(
        coalesce(sum(amount) filter (where type = 'expense'), 0)
        - coalesce(sum(amount) filter (where type in ('refund', 'reimbursement')), 0),
        0
      ) as operating_expenses
    from public.transactions
    where workspace_id = p_workspace_id
      and extract(year from transaction_date) = p_year
      and deleted_at is null
      and voided_at is null
  )
  select jsonb_build_object(
    'year', p_year,
    'grossCommissionIncome', c.gross_commission_income,
    'netCommissionReceived', c.net_commission_received,
    'otherIncome', t.other_income,
    'collectedIncome', c.net_commission_received + t.other_income,
    'operatingExpenses', t.operating_expenses,
    'netBusinessIncome', c.net_commission_received + t.other_income - t.operating_expenses,
    'suggestedTaxReserve', c.suggested_tax_reserve,
    'pendingGrossCommission', c.pending_gross_commission,
    'pendingNetCommission', c.pending_net_commission
  ) into v_result
  from commission_totals c cross join transaction_totals t;

  return v_result;
end;
$$;

revoke all on function public.workspace_financial_summary(uuid, integer) from public;
grant execute on function public.workspace_financial_summary(uuid, integer) to authenticated;

commit;
