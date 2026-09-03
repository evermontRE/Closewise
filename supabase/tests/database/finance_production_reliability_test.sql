begin;
select plan(25);
select has_table('public','maintenance_runs','maintenance history exists');
select has_table('public','service_health_checks','service health state exists');
select has_table('public','operational_alerts','operational alert state exists');
select has_table('public','backup_verifications','backup verification history exists');
select has_function('public','claim_maintenance_run',array['text'],'maintenance claims are atomic');
select has_function('public','finish_maintenance_run',array['uuid','boolean','jsonb','text'],'maintenance completion is durable');
select has_function('public','record_service_health',array['text','text','text','jsonb'],'health recording exists');
select has_function('public','set_operational_alert',array['text','text','text','text','boolean','jsonb'],'alert recording exists');

create temporary table claimed as select public.claim_maintenance_run('cron-2026-09-03') id;
select ok((select id is not null from claimed),'first maintenance invocation is claimed');
select is(public.claim_maintenance_run('cron-2026-09-03'),null,'duplicate maintenance invocation is ignored');
select public.finish_maintenance_run((select id from claimed),true,'{"purged":4}',null);
select is((select status from public.maintenance_runs where id=(select id from claimed)),'succeeded','maintenance completion is retained');
select ok((select finished_at is not null from public.maintenance_runs where id=(select id from claimed)),'maintenance completion has a timestamp');

select public.record_service_health('database','healthy','Database query succeeded.','{"latencyMs":12}');
select is((select status from public.service_health_checks where service='database'),'healthy','service health is stored');
select is((select metrics->>'latencyMs' from public.service_health_checks where service='database'),'12','health metrics are retained');
select throws_ok($$select public.record_service_health('unknown','healthy','Bad service.','{}')$$,'P0001','Unsupported monitored service','unsupported services are rejected');

select public.set_operational_alert('stripe-failed','stripe-webhooks','critical','Stripe webhooks failed.',true,'{"failed":2}');
select is((select status from public.operational_alerts where alert_key='stripe-failed'),'open','alert opens');
select is((select occurrence_count from public.operational_alerts where alert_key='stripe-failed'),1,'first occurrence is counted');
select public.set_operational_alert('stripe-failed','stripe-webhooks','critical','Stripe webhooks still failing.',true,'{"failed":3}');
select is((select occurrence_count from public.operational_alerts where alert_key='stripe-failed'),2,'repeat occurrence increments');
select public.set_operational_alert('stripe-failed','stripe-webhooks','critical','Stripe webhooks recovered.',false,'{}');
select is((select status from public.operational_alerts where alert_key='stripe-failed'),'resolved','alert resolves');
select ok((select resolved_at is not null from public.operational_alerts where alert_key='stripe-failed'),'resolution is timestamped');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values('1e000000-0000-4000-8000-000000000001','customer@example.test','{}','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',true);
select throws_ok($$select count(*) from public.maintenance_runs$$,'42501',null,'customers cannot read maintenance history');
select throws_ok($$select count(*) from public.service_health_checks$$,'42501',null,'customers cannot read service health internals');
select throws_ok($$select count(*) from public.operational_alerts$$,'42501',null,'customers cannot read operational alerts');
select throws_ok($$select count(*) from public.backup_verifications$$,'42501',null,'customers cannot read backup verifications');
select throws_ok($$select public.claim_maintenance_run('customer-attempt')$$,'42501',null,'customers cannot claim maintenance work');
reset role;
select * from finish();
rollback;
