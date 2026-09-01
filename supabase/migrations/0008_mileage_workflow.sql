-- Authenticated vehicle, annual odometer, and business mileage workflow.
-- Apply after 0007_receipt_storage.sql.

begin;

alter table public.vehicles
  add column if not exists odometer_year integer not null default 2026,
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.vehicles alter column beginning_odometer type numeric(12,2);
alter table public.vehicles alter column ending_odometer type numeric(12,2);
alter table public.vehicles add constraint vehicles_odometer_year_check check(odometer_year between 1900 and 2100);
alter table public.vehicles add constraint vehicles_odometer_order_check check(ending_odometer is null or beginning_odometer is null or ending_odometer >= beginning_odometer);

alter table public.mileage_trips
  add column if not exists start_odometer numeric(12,2),
  add column if not exists end_odometer numeric(12,2),
  add column if not exists mileage_rate_year integer not null default 2026,
  add column if not exists rate_source text not null default 'default',
  add column if not exists deduction_amount numeric(14,2) not null default 0,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.mileage_trips add constraint mileage_trip_positive_miles_check check(miles > 0);
alter table public.mileage_trips add constraint mileage_trip_odometer_pair_check check((start_odometer is null)=(end_odometer is null));
alter table public.mileage_trips add constraint mileage_trip_odometer_order_check check(end_odometer is null or end_odometer > start_odometer);
alter table public.mileage_trips add constraint mileage_trip_rate_year_check check(mileage_rate_year between 1900 and 2100);
alter table public.mileage_trips add constraint mileage_trip_rate_source_check check(rate_source in('default','custom'));
alter table public.mileage_trips add constraint mileage_trip_deduction_check check(deduction_amount >= 0);

create unique index if not exists vehicles_one_primary_idx on public.vehicles(workspace_id) where is_primary and deleted_at is null;
create index if not exists vehicles_workspace_name_idx on public.vehicles(workspace_id,lower(name)) where deleted_at is null;
create index if not exists mileage_trips_workspace_vehicle_date_idx on public.mileage_trips(workspace_id,vehicle_id,trip_date desc) where deleted_at is null;

create or replace function public.mutate_mileage_record(
  p_workspace_id uuid,p_actor_id uuid,p_client_mutation_id text,p_entity_type text,p_operation text,
  p_entity_id uuid,p_expected_version bigint,p_payload_hash text,p_record jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;v_version bigint;v_before jsonb;v_after jsonb;v_reason text;
  v_existing_hash text;v_existing_entity text;v_existing_operation text;v_existing_version bigint;
  v_start numeric;v_end numeric;v_miles numeric;v_rate numeric;v_parking numeric;v_tolls numeric;v_deduction numeric;
begin
  if p_client_mutation_id is null or length(trim(p_client_mutation_id))<8 then raise exception 'A stable client mutation identifier is required';end if;
  if p_entity_type not in('vehicle','mileage_trip') then raise exception 'Unsupported mileage entity';end if;
  if p_operation not in('create','update','void') then raise exception 'Unsupported mileage operation';end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in('owner','admin','member','bookkeeper')) then raise exception 'Not authorized to change mileage records';end if;
  select entity_id,entity_type,operation,payload_hash,result_version into v_id,v_existing_entity,v_existing_operation,v_existing_hash,v_existing_version from public.sync_operations where workspace_id=p_workspace_id and client_mutation_id=p_client_mutation_id;
  if v_id is not null then
    if v_existing_entity<>p_entity_type or v_existing_hash is distinct from nullif(p_payload_hash,'') then raise exception 'Idempotency key was already used for different content';end if;
    return jsonb_build_object('id',v_id,'operation',v_existing_operation,'version',v_existing_version);
  end if;
  if p_operation<>'create' and(p_entity_id is null or p_expected_version is null)then raise exception 'Record identifier and expected version are required';end if;

  if p_entity_type='vehicle' then
    if p_operation='create' then
      insert into public.vehicles(workspace_id,name,make,model,year,odometer_year,beginning_odometer,ending_odometer,is_primary,created_by)
      values(p_workspace_id,p_record->>'name',nullif(p_record->>'make',''),nullif(p_record->>'model',''),nullif(p_record->>'year','')::integer,(p_record->>'odometerYear')::integer,nullif(p_record->>'beginningOdometer','')::numeric,nullif(p_record->>'endingOdometer','')::numeric,coalesce((p_record->>'isPrimary')::boolean,false),p_actor_id)
      returning id,version into v_id,v_version;
    else
      select to_jsonb(v.*) into v_before from public.vehicles v where id=p_entity_id and workspace_id=p_workspace_id and deleted_at is null for update;
      if v_before is null then raise exception 'Record not found';end if;if(v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;
      if p_operation='update' then
        update public.vehicles set name=p_record->>'name',make=nullif(p_record->>'make',''),model=nullif(p_record->>'model',''),year=nullif(p_record->>'year','')::integer,odometer_year=(p_record->>'odometerYear')::integer,beginning_odometer=nullif(p_record->>'beginningOdometer','')::numeric,ending_odometer=nullif(p_record->>'endingOdometer','')::numeric,is_primary=coalesce((p_record->>'isPrimary')::boolean,false) where id=p_entity_id returning id,version into v_id,v_version;
      else
        v_reason:=nullif(trim(p_record->>'reason'),'');if v_reason is null or length(v_reason)<5 then raise exception 'A void reason is required';end if;
        if exists(select 1 from public.mileage_trips where vehicle_id=p_entity_id and deleted_at is null)then raise exception 'Void the vehicle trips before removing this vehicle';end if;
        update public.vehicles set is_primary=false,void_reason=v_reason,voided_at=now(),voided_by=p_actor_id,deleted_at=now() where id=p_entity_id returning id,version into v_id,v_version;
      end if;
    end if;
    select to_jsonb(v.*) into v_after from public.vehicles v where id=v_id;
  else
    if p_operation<>'void' then
      if not exists(select 1 from public.vehicles where id=(p_record->>'vehicleId')::uuid and workspace_id=p_workspace_id and deleted_at is null)then raise exception 'Vehicle is not available in this workspace';end if;
      if nullif(p_record->>'clientId','')is not null and not exists(select 1 from public.clients where id=(p_record->>'clientId')::uuid and workspace_id=p_workspace_id and deleted_at is null)then raise exception 'Client is not available in this workspace';end if;
      if nullif(p_record->>'propertyId','')is not null and not exists(select 1 from public.properties where id=(p_record->>'propertyId')::uuid and workspace_id=p_workspace_id and deleted_at is null)then raise exception 'Property is not available in this workspace';end if;
      v_start:=nullif(p_record->>'startOdometer','')::numeric;v_end:=nullif(p_record->>'endOdometer','')::numeric;v_miles:=(p_record->>'miles')::numeric;v_rate:=(p_record->>'mileageRate')::numeric;v_parking:=(p_record->>'parking')::numeric;v_tolls:=(p_record->>'tolls')::numeric;
      if v_miles<=0 or v_rate<=0 then raise exception 'Miles and mileage rate must be greater than zero';end if;
      if(v_start is null)<>(v_end is null)then raise exception 'Both trip odometers are required together';end if;
      if v_start is not null and round(v_end-v_start,2)<>round(v_miles,2)then raise exception 'Trip miles must equal the odometer difference';end if;
      if(p_record->>'mileageRateYear')::integer<>extract(year from(p_record->>'tripDate')::date)::integer then raise exception 'Mileage rate year must match the trip date';end if;
      v_deduction:=round(v_miles*v_rate+v_parking+v_tolls,2);
    end if;
    if p_operation='create' then
      insert into public.mileage_trips(workspace_id,vehicle_id,client_id,property_id,trip_date,purpose,start_location,end_location,start_odometer,end_odometer,miles,mileage_rate,mileage_rate_year,rate_source,parking,tolls,deduction_amount,notes,created_by)
      values(p_workspace_id,(p_record->>'vehicleId')::uuid,nullif(p_record->>'clientId','')::uuid,nullif(p_record->>'propertyId','')::uuid,(p_record->>'tripDate')::date,p_record->>'purpose',nullif(p_record->>'startLocation',''),nullif(p_record->>'endLocation',''),v_start,v_end,v_miles,v_rate,(p_record->>'mileageRateYear')::integer,p_record->>'rateSource',v_parking,v_tolls,v_deduction,nullif(p_record->>'notes',''),p_actor_id) returning id,version into v_id,v_version;
    else
      select to_jsonb(t.*)into v_before from public.mileage_trips t where id=p_entity_id and workspace_id=p_workspace_id and deleted_at is null for update;
      if v_before is null then raise exception 'Record not found';end if;if(v_before->>'version')::bigint<>p_expected_version then raise exception using errcode='40001',message='Record version conflict';end if;
      if p_operation='update' then
        update public.mileage_trips set vehicle_id=(p_record->>'vehicleId')::uuid,client_id=nullif(p_record->>'clientId','')::uuid,property_id=nullif(p_record->>'propertyId','')::uuid,trip_date=(p_record->>'tripDate')::date,purpose=p_record->>'purpose',start_location=nullif(p_record->>'startLocation',''),end_location=nullif(p_record->>'endLocation',''),start_odometer=v_start,end_odometer=v_end,miles=v_miles,mileage_rate=v_rate,mileage_rate_year=(p_record->>'mileageRateYear')::integer,rate_source=p_record->>'rateSource',parking=v_parking,tolls=v_tolls,deduction_amount=v_deduction,notes=nullif(p_record->>'notes','') where id=p_entity_id returning id,version into v_id,v_version;
      else
        v_reason:=nullif(trim(p_record->>'reason'),'');if v_reason is null or length(v_reason)<5 then raise exception 'A void reason is required';end if;
        update public.mileage_trips set void_reason=v_reason,voided_at=now(),voided_by=p_actor_id,deleted_at=now() where id=p_entity_id returning id,version into v_id,v_version;
      end if;
    end if;
    select to_jsonb(t.*)into v_after from public.mileage_trips t where id=v_id;
  end if;
  insert into public.sync_operations(workspace_id,user_id,device_id,client_mutation_id,entity_type,entity_id,operation,base_version,result_version,payload_hash,status)values(p_workspace_id,p_actor_id,coalesce(nullif(p_record->>'deviceId',''),'web'),p_client_mutation_id,p_entity_type,v_id,p_operation,p_expected_version,v_version,nullif(p_payload_hash,''),'applied');
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,reason,before_data,after_data,request_id)values(p_workspace_id,p_actor_id,p_operation,p_entity_type,v_id,v_reason,v_before,v_after,p_client_mutation_id);
  return jsonb_build_object('id',v_id,'operation',p_operation,'version',v_version);
end;$$;

revoke all on function public.mutate_mileage_record(uuid,uuid,text,text,text,uuid,bigint,text,jsonb) from public,authenticated;
grant execute on function public.mutate_mileage_record(uuid,uuid,text,text,text,uuid,bigint,text,jsonb) to service_role;

commit;
