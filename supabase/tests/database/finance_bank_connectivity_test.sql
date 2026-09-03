begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(19);

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('17000000-0000-4000-8000-000000000001','connect-owner@example.test','{}','{}'),
('17000000-0000-4000-8000-000000000002','connect-outsider@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values('27000000-0000-4000-8000-000000000001','Connected Bank Workspace','17000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.connect_plaid_item('27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001','item','cipher',null,null,'[]')$$,'42501',null,'authenticated clients cannot store provider credentials');
reset role;

set local role service_role;
create temporary table plaid_connection as select public.connect_plaid_item(
'27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001','plaid-item-1','v1.encrypted.token','ins-1','Evermont Test Bank',
'[{"account_id":"plaid-account-1","name":"Business Checking","mask":"1234","type":"depository","subtype":"checking","balances":{"current":1000.25,"available":900.25,"iso_currency_code":"USD"}}]'::jsonb) result;
select is((select result->>'status' from plaid_connection),'syncing','new connection begins in syncing state');
select is((select count(*)::integer from public.bank_connections where provider_item_id='plaid-item-1'),1,'provider item is stored once');
select is((select access_token_ciphertext from public.bank_connections where provider_item_id='plaid-item-1'),'v1.encrypted.token','only encrypted credential text is stored');
select is((select account_type from public.bank_accounts where provider_account_id='plaid-account-1'),'checking','Plaid account becomes a bookkeeping bank account');
select is((select current_balance::text from public.bank_accounts where provider_account_id='plaid-account-1'),'1000.25','current balance is retained');
select is((select count(*)::integer from public.audit_events where entity_type='bank_connection'),1,'connection creates an audit event');

insert into public.commissions(id,workspace_id,status,closed_date,sales_price,gross_commission,net_received,created_by)
values('47000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000001','paid','2026-09-01',500000,15000,2500,'17000000-0000-4000-8000-000000000001');
create temporary table first_sync as select public.apply_plaid_transaction_sync(
(select (result->>'id')::uuid from plaid_connection),
'[{"providerTransactionId":"plaid-tx-1","providerAccountId":"plaid-account-1","postedDate":"2026-09-02","description":"Title Company Commission","merchantName":"Title Company","amount":"2500.00","direction":"inflow","pending":false,"providerCategory":"INCOME","fingerprint":"plaid-fingerprint-1","rawData":{"transaction_id":"plaid-tx-1"}}]'::jsonb,
'[]'::jsonb,'[]'::jsonb,'cursor-1') result;
select is((select result->>'added' from first_sync),'1','first sync processes the new line');
select is((select count(*)::integer from public.bank_transactions where provider_transaction_id='plaid-tx-1'),1,'provider transaction is imported');
select is((select direction from public.bank_transactions where provider_transaction_id='plaid-tx-1'),'inflow','signed provider amount keeps the expected direction');
select is((select status from public.bank_connections where provider_item_id='plaid-item-1'),'healthy','successful sync marks the connection healthy');
select is((select sync_cursor from public.bank_connections where provider_item_id='plaid-item-1'),'cursor-1','incremental cursor advances atomically');
select ok((select exists(select 1 from public.bank_reconciliation_suggestions where target_type='commission' and target_id='47000000-0000-4000-8000-000000000001' and confidence>=92)),'exact nearby commission produces a high-confidence suggestion');

select public.apply_plaid_transaction_sync((select (result->>'id')::uuid from plaid_connection),'[{"providerTransactionId":"plaid-tx-1","providerAccountId":"plaid-account-1","postedDate":"2026-09-02","description":"Updated Commission","amount":"2500.00","direction":"inflow","pending":false,"fingerprint":"plaid-fingerprint-1","rawData":{"transaction_id":"plaid-tx-1","changed":true}}]'::jsonb,'[]'::jsonb,'[]'::jsonb,'cursor-2');
select is((select count(*)::integer from public.bank_transactions where provider_transaction_id='plaid-tx-1'),1,'replayed provider transaction does not duplicate');
select ok((select provider_modified_at is not null from public.bank_transactions where provider_transaction_id='plaid-tx-1'),'provider changes are marked for review');
select public.apply_plaid_transaction_sync((select (result->>'id')::uuid from plaid_connection),'[]'::jsonb,'[]'::jsonb,'[{"transaction_id":"plaid-tx-1"}]'::jsonb,'cursor-3');
select ok((select provider_removed_at is not null from public.bank_transactions where provider_transaction_id='plaid-tx-1'),'provider removals preserve and mark the bookkeeping line');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.bank_connections),0,'encrypted connection credentials are never client-readable');
select is((select count(*)::integer from public.bank_reconciliation_suggestions),1,'workspace member can read reconciliation suggestions');
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.bank_reconciliation_suggestions),0,'outsider cannot read reconciliation suggestions');

select * from finish();
rollback;
