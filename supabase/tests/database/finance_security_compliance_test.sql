begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(14);

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('18000000-0000-4000-8000-000000000001','security-owner@example.test','{}','{}'),
('18000000-0000-4000-8000-000000000002','security-outsider@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values('28000000-0000-4000-8000-000000000001','Security Workspace','18000000-0000-4000-8000-000000000001');
insert into public.bank_connections(id,workspace_id,provider,provider_item_id,institution_name,access_token_ciphertext,status,created_by)
values('38000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000001','plaid','security-item','Security Bank','v1.encrypted.token','healthy','18000000-0000-4000-8000-000000000001');
insert into public.bank_accounts(workspace_id,institution_name,account_name,account_type,connection_provider,provider_account_id,connection_id,is_active,created_by)
values('28000000-0000-4000-8000-000000000001','Security Bank','Checking','checking','plaid','security-account','38000000-0000-4000-8000-000000000001',true,'18000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.consume_api_rate_limit('security-test-key',2,60)$$,'42501',null,'authenticated users cannot bypass rate limits');
select throws_ok($$select public.finalize_bank_disconnection('38000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000001')$$,'42501',null,'authenticated clients cannot destroy provider credentials directly');
select throws_ok($$insert into public.privacy_requests(requester_id,request_type) values('18000000-0000-4000-8000-000000000001','access')$$,'42501',null,'privacy request state is server managed');
reset role;

set local role service_role;
select is((public.consume_api_rate_limit('security-test-key',2,60)->>'allowed')::boolean,true,'first request is allowed');
select is((public.consume_api_rate_limit('security-test-key',2,60)->>'allowed')::boolean,true,'second request is allowed');
select is((public.consume_api_rate_limit('security-test-key',2,60)->>'allowed')::boolean,false,'request above limit is blocked');
insert into public.privacy_requests(requester_id,workspace_id,request_type) values
('18000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000001','deletion'),
('18000000-0000-4000-8000-000000000002',null,'access');
select is((public.finalize_bank_disconnection('38000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000001')->>'credentialDestroyed')::boolean,true,'trusted server finalizes disconnection');
select is((select access_token_ciphertext from public.bank_connections where id='38000000-0000-4000-8000-000000000001'),null,'disconnection destroys stored credential');
select is((select status from public.bank_connections where id='38000000-0000-4000-8000-000000000001'),'disconnected','connection is marked disconnected');
select is((select is_active from public.bank_accounts where connection_id='38000000-0000-4000-8000-000000000001'),false,'connected accounts are made inactive');
select is((select count(*)::integer from public.audit_events where action='disconnect' and entity_id='38000000-0000-4000-8000-000000000001'),1,'credential destruction is audited');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.api_rate_limits),0,'rate-limit state is never client-readable');
select is((select count(*)::integer from public.privacy_requests),1,'requester sees only their privacy requests');
select set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.privacy_requests),1,'another requester sees only their own requests');

select * from finish();
rollback;
