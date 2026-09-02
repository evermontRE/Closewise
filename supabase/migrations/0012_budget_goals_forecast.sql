-- Versioned goals and monthly operating budgets used by cash forecasting.
begin;
create index if not exists goals_workspace_year_idx on public.goals(workspace_id,year);
create index if not exists budgets_workspace_year_idx on public.budgets(workspace_id,year);
create index if not exists budget_lines_workspace_month_idx on public.budget_lines(workspace_id,month);

create or replace function public.mutate_financial_plan(p_workspace_id uuid,p_actor_id uuid,p_client_mutation_id text,p_entity_type text,p_entity_id uuid,p_expected_version bigint,p_payload_hash text,p_record jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_version bigint;v_before jsonb;v_after jsonb;v_hash text;v_result bigint;v_year integer;v_name text;v_line jsonb;
begin
 if p_client_mutation_id is null or length(trim(p_client_mutation_id))<8 then raise exception 'A stable client mutation identifier is required';end if;
 if p_entity_type not in('goal','budget')then raise exception 'Unsupported financial plan entity';end if;
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in('owner','admin','member','bookkeeper'))then raise exception 'Not authorized to change financial plans';end if;
 select entity_id,payload_hash,result_version into v_id,v_hash,v_result from public.sync_operations where workspace_id=p_workspace_id and client_mutation_id=p_client_mutation_id;if v_id is not null then if v_hash is distinct from nullif(p_payload_hash,'')then raise exception 'Idempotency key was already used for different content';end if;return jsonb_build_object('id',v_id,'version',v_result);end if;
 v_year:=(p_record->>'year')::integer;if v_year<1900 or v_year>2100 then raise exception 'A valid planning year is required';end if;
 if p_entity_type='goal'then
  select id,to_jsonb(g.*)into v_id,v_before from public.goals g where workspace_id=p_workspace_id and year=v_year for update;
  if v_id is null then insert into public.goals(workspace_id,year,gci_target,net_income_target,closed_transactions_target,tax_reserve_target,marketing_budget,target_expense_ratio_pct,created_by)values(p_workspace_id,v_year,(p_record->>'gciTarget')::numeric,(p_record->>'netIncomeTarget')::numeric,(p_record->>'closedTransactionsTarget')::integer,(p_record->>'taxReserveTarget')::numeric,(p_record->>'marketingBudget')::numeric,(p_record->>'targetExpenseRatioPct')::numeric,p_actor_id)returning id,version into v_id,v_version;
  else if p_entity_id is distinct from v_id or p_expected_version is null then raise exception 'Record identifier and expected version are required';end if;if(v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;update public.goals set gci_target=(p_record->>'gciTarget')::numeric,net_income_target=(p_record->>'netIncomeTarget')::numeric,closed_transactions_target=(p_record->>'closedTransactionsTarget')::integer,tax_reserve_target=(p_record->>'taxReserveTarget')::numeric,marketing_budget=(p_record->>'marketingBudget')::numeric,target_expense_ratio_pct=(p_record->>'targetExpenseRatioPct')::numeric where id=v_id returning version into v_version;end if;
  select to_jsonb(g.*)into v_after from public.goals g where id=v_id;
 else
  v_name:=trim(p_record->>'name');select id,to_jsonb(b.*)into v_id,v_before from public.budgets b where workspace_id=p_workspace_id and year=v_year and name=v_name for update;
  if v_id is null then insert into public.budgets(workspace_id,year,name,created_by)values(p_workspace_id,v_year,v_name,p_actor_id)returning id,version into v_id,v_version;
  else if p_entity_id is distinct from v_id or p_expected_version is null then raise exception 'Record identifier and expected version are required';end if;if(v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;update public.budgets set name=v_name where id=v_id returning version into v_version;delete from public.budget_lines where budget_id=v_id;end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_record->'lines','[]'::jsonb))loop if nullif(v_line->>'categoryId','')is not null and not exists(select 1 from public.categories where id=(v_line->>'categoryId')::uuid and workspace_id=p_workspace_id and kind='expense'and deleted_at is null)then raise exception 'Budget category is not available in this workspace';end if;insert into public.budget_lines(workspace_id,budget_id,category_id,month,amount,created_by)values(p_workspace_id,v_id,nullif(v_line->>'categoryId','')::uuid,(v_line->>'month')::integer,(v_line->>'amount')::numeric,p_actor_id);end loop;
  select to_jsonb(b.*)||jsonb_build_object('lines',(select coalesce(jsonb_agg(to_jsonb(l.*)),'[]'::jsonb)from public.budget_lines l where budget_id=v_id))into v_after from public.budgets b where id=v_id;
 end if;
 insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)values(p_workspace_id,p_actor_id,coalesce(nullif(p_record->>'deviceId',''),'web'),p_client_mutation_id,p_entity_type,v_id,case when v_before is null then'create'else'update'end,p_expected_version,v_version,nullif(p_payload_hash,''),'applied');
 insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,before_data,after_data,request_id)values(p_workspace_id,p_actor_id,case when v_before is null then'create'else'update'end,p_entity_type,v_id,v_before,v_after,p_client_mutation_id);return jsonb_build_object('id',v_id,'version',v_version);
end;$$;
revoke all on function public.mutate_financial_plan(uuid,uuid,text,text,uuid,bigint,text,jsonb)from public,authenticated;grant execute on function public.mutate_financial_plan(uuid,uuid,text,text,uuid,bigint,text,jsonb)to service_role;
commit;
