begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(13);

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('1b000000-0000-4000-8000-000000000001','plan-owner@example.test','{}','{}'),
('1b000000-0000-4000-8000-000000000002','plan-member@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values
('2b000000-0000-4000-8000-000000000001','Planning Workspace','1b000000-0000-4000-8000-000000000001');
insert into public.workspace_settings(workspace_id) values
('2b000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role) values
('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000002','member');

set local role authenticated;
select throws_ok(
  $$select public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','plan-denied-key',1,'hash','{}')$$,
  '42501', null, 'authenticated clients cannot call the service-role planning function'
);
reset role;

create temporary table plan_update as
select public.update_tax_planning_assumptions(
  '2b000000-0000-4000-8000-000000000001',
  '1b000000-0000-4000-8000-000000000001',
  'plan-update-0001', 1, 'plan-hash-1',
  '{"federalRatePct":22,"stateRatePct":5,"selfEmploymentRatePct":15.3,"selfEmploymentTaxableBasePct":92.35,"qbiDeductionPct":20,"deductHalfSelfEmploymentTax":true,"additionalDeductions":"1250.00","safeHarborEnabled":true,"priorYearAgi":"175000.00","priorYearTotalTax":"32000.00","priorYearFiled":true,"priorYearFullTwelveMonths":true,"marriedFilingSeparately":false,"deviceId":"database-test"}'
) result;

select is((select result->>'version' from plan_update),'2','settings update increments the record version');
select is((select tax_assumptions->>'federalRatePct' from public.workspace_settings where workspace_id='2b000000-0000-4000-8000-000000000001'),'22','federal planning rate is retained');
select is((select tax_assumptions->>'priorYearTotalTax' from public.workspace_settings where workspace_id='2b000000-0000-4000-8000-000000000001'),'32000.00','prior-year total tax is retained exactly');
select is((select count(*)::integer from public.sync_operations where client_mutation_id='plan-update-0001'),1,'settings update writes a sync receipt');
select is((select count(*)::integer from public.audit_events where request_id='plan-update-0001'),1,'settings update writes an audit event');
select is(public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','plan-update-0001',1,'plan-hash-1','{}')->>'version','2','an identical retry is idempotent');
select throws_ok($$select public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','plan-update-0001',1,'different-hash','{}')$$,'P0001','Idempotency key was already used for different content','an idempotency key cannot be reused for different content');
select throws_ok($$select public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','plan-stale-0001',1,'stale','{"federalRatePct":20,"stateRatePct":5,"selfEmploymentRatePct":15.3,"selfEmploymentTaxableBasePct":92.35,"qbiDeductionPct":20,"priorYearAgi":0,"priorYearTotalTax":0,"additionalDeductions":0}')$$,'40001','Record version conflict','stale settings updates are rejected');
select throws_ok($$select public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000002','plan-member-0001',2,'member','{}')$$,'P0001','Only workspace owners and administrators can change tax planning assumptions','ordinary members cannot change tax assumptions');
select throws_ok($$select public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','plan-rate-0001',2,'rate','{"federalRatePct":101,"stateRatePct":5,"selfEmploymentRatePct":15.3,"selfEmploymentTaxableBasePct":92.35,"qbiDeductionPct":20,"priorYearAgi":0,"priorYearTotalTax":0,"additionalDeductions":0}')$$,'P0001','Planning percentages must be from 0 to 100','planning percentages are bounded');
select throws_ok($$select public.update_tax_planning_assumptions('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','plan-money-0001',2,'money','{"federalRatePct":22,"stateRatePct":5,"selfEmploymentRatePct":15.3,"selfEmploymentTaxableBasePct":92.35,"qbiDeductionPct":20,"priorYearAgi":0,"priorYearTotalTax":0,"additionalDeductions":-1}')$$,'P0001','Planning amounts cannot be negative','planning amounts cannot be negative');
select ok((select tax_assumptions->>'safeHarborEnabled'='true' from public.workspace_settings where workspace_id='2b000000-0000-4000-8000-000000000001'),'safe-harbor preference remains enabled');

select * from finish();
rollback;
