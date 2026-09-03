begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(25);

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('1a000000-0000-4000-8000-000000000001','billing-owner@example.test','{}','{}'),
('1a000000-0000-4000-8000-000000000002','billing-member@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values('2a000000-0000-4000-8000-000000000001','Billing Workspace','1a000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role) values('2a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000002','member');

select has_table('public','stripe_webhook_events','Stripe webhook receipt table exists');
select has_table('public','billing_events','billing audit table exists');
select has_column('public','subscriptions','grace_period_end','grace period is stored');
select has_column('public','subscriptions','cancel_at_period_end','scheduled cancellation is stored');
select has_function('public','claim_stripe_webhook_event',array['text','text','boolean'],'webhook claim function exists');
select has_function('public','claim_billing_checkout',array['uuid'],'checkout claim function exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.claim_stripe_webhook_event('evt_forbidden','test',false)$$,'42501',null,'clients cannot claim webhook events');
select throws_ok($$select * from public.stripe_webhook_events$$,'42501',null,'webhook receipts are never client-readable');
select throws_ok($$select public.apply_stripe_subscription_snapshot('2a000000-0000-4000-8000-000000000001','evt_forbidden','test',now(),'cus_x','sub_x','price_x','professional','active',now(),false,null,null,null,null)$$,'42501',null,'clients cannot apply billing snapshots');
reset role;

set local role service_role;
select is(public.claim_billing_checkout('2a000000-0000-4000-8000-000000000001'),true,'first checkout is claimed');
select is(public.claim_billing_checkout('2a000000-0000-4000-8000-000000000001'),false,'concurrent checkout is blocked');
update public.subscriptions set status='none',checkout_started_at=null where workspace_id='2a000000-0000-4000-8000-000000000001';
select is(public.claim_stripe_webhook_event('evt_1','customer.subscription.updated',false),true,'first delivery is claimed');
select is(public.claim_stripe_webhook_event('evt_1','customer.subscription.updated',false),false,'concurrent duplicate is ignored');
select is((public.apply_stripe_subscription_snapshot('2a000000-0000-4000-8000-000000000001','evt_1','customer.subscription.updated','2026-09-03T12:00:00Z','cus_1','sub_1','price_pro','professional','active','2026-10-03T12:00:00Z',false,null,null,null,'paid')->>'applied')::boolean,true,'new subscription snapshot is applied');
select is((select status from public.subscriptions where workspace_id='2a000000-0000-4000-8000-000000000001'),'active','subscription status is synchronized');
select is((select stripe_customer_id from public.workspaces where id='2a000000-0000-4000-8000-000000000001'),'cus_1','Stripe customer is bound to workspace');
select is((select count(*)::integer from public.billing_events where stripe_event_id='evt_1'),1,'billing transition is audited once');
select lives_ok($$select public.complete_stripe_webhook_event('evt_1',true,null)$$,'successful delivery is completed');
select is((select status from public.stripe_webhook_events where event_id='evt_1'),'completed','webhook receipt is complete');
select is(public.claim_stripe_webhook_event('evt_1','customer.subscription.updated',false),false,'completed delivery never replays');
select is(public.claim_stripe_webhook_event('evt_old','customer.subscription.updated',false),true,'older event can be received');
select is((public.apply_stripe_subscription_snapshot('2a000000-0000-4000-8000-000000000001','evt_old','customer.subscription.updated','2026-09-02T12:00:00Z','cus_1','sub_1','price_basic','essentials','canceled',null,false,null,now(),null,null)->>'applied')::boolean,false,'out-of-order event cannot downgrade current state');
select is((select status from public.subscriptions where workspace_id='2a000000-0000-4000-8000-000000000001'),'active','newer subscription state is retained');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.billing_events),0,'ordinary members cannot read billing audit');
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.billing_events),1,'workspace owner can read billing audit');

select * from finish();
rollback;
