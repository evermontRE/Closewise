-- User-controlled tax-planning assumptions and prior-year safe-harbor inputs.
-- Planning estimates only; no tax return preparation or filing.
begin;
alter table public.workspace_settings add column if not exists version bigint not null default 1;
create trigger workspace_settings_version_trigger before update on public.workspace_settings for each row execute function public.bump_record_version();
create or replace function public.update_tax_planning_assumptions(p_workspace_id uuid,p_actor_id uuid,p_client_mutation_id text,p_expected_version bigint,p_payload_hash text,p_assumptions jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing_id uuid;v_existing_hash text;v_existing_version bigint;v_before jsonb;v_after jsonb;v_version bigint;v_pct text;
begin
 if p_client_mutation_id is null or length(trim(p_client_mutation_id))<8 then raise exception 'A stable client mutation identifier is required';end if;if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in('owner','admin'))then raise exception 'Only workspace owners and administrators can change tax planning assumptions';end if;
 select entity_id,payload_hash,result_version into v_existing_id,v_existing_hash,v_existing_version from public.sync_operations where workspace_id=p_workspace_id and client_mutation_id=p_client_mutation_id;if v_existing_id is not null then if v_existing_hash is distinct from nullif(p_payload_hash,'')then raise exception 'Idempotency key was already used for different content';end if;return jsonb_build_object('workspaceId',v_existing_id,'version',v_existing_version);end if;
 if p_expected_version is null then raise exception 'Expected settings version is required';end if;
 select to_jsonb(s.*)into v_before from public.workspace_settings s where workspace_id=p_workspace_id for update;if v_before is null then raise exception 'Workspace settings not found';end if;if(v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;
 foreach v_pct in array array['federalRatePct','stateRatePct','selfEmploymentRatePct','selfEmploymentTaxableBasePct','qbiDeductionPct']loop if(p_assumptions->>v_pct)::numeric<0 or(p_assumptions->>v_pct)::numeric>100 then raise exception 'Planning percentages must be from 0 to 100';end if;end loop;
 if(p_assumptions->>'priorYearAgi')::numeric<0 or(p_assumptions->>'priorYearTotalTax')::numeric<0 or(p_assumptions->>'additionalDeductions')::numeric<0 then raise exception 'Planning amounts cannot be negative';end if;
 update public.workspace_settings set tax_assumptions=p_assumptions where workspace_id=p_workspace_id returning version into v_version;select to_jsonb(s.*)into v_after from public.workspace_settings s where workspace_id=p_workspace_id;
 insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)values(p_workspace_id,p_actor_id,coalesce(nullif(p_assumptions->>'deviceId',''),'web'),p_client_mutation_id,'tax_plan_settings',p_workspace_id,'update',p_expected_version,v_version,nullif(p_payload_hash,''),'applied');insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,before_data,after_data,request_id)values(p_workspace_id,p_actor_id,'update','tax_plan_settings',p_workspace_id,v_before,v_after,p_client_mutation_id);return jsonb_build_object('workspaceId',p_workspace_id,'version',v_version);
end;$$;
revoke all on function public.update_tax_planning_assumptions(uuid,uuid,text,bigint,text,jsonb)from public,authenticated;grant execute on function public.update_tax_planning_assumptions(uuid,uuid,text,bigint,text,jsonb)to service_role;
commit;
