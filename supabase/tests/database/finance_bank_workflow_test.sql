begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(33);

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('13000000-0000-4000-8000-000000000001','bank-owner@example.test','{}','{}'),
('13000000-0000-4000-8000-000000000002','bank-outsider@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values
('23000000-0000-4000-8000-000000000001','Bank Workspace','13000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.mutate_bank_account('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-denied','create',null,null,'hash','{}')$$,'42501',null,'authenticated clients cannot call account function');
select throws_ok($$select public.import_bank_statement('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',null,'x.csv','hash','test','[]')$$,'42501',null,'authenticated clients cannot call import function');
select throws_ok($$select public.review_bank_transaction('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',null,'bank-review-denied',1,'hash','{}')$$,'42501',null,'authenticated clients cannot call review function');
reset role;

create temporary table account_create as select public.mutate_bank_account(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-create','create',null,null,'account-create-hash',
'{"institutionName":"Evermont Bank","accountName":"Operating","accountType":"checking","mask":"1234","currency":"USD","isActive":true,"deviceId":"database-test"}'
) result;
select is((select (result->>'version')::integer from account_create),1,'bank account starts at version one');
select is((select account_name from public.bank_accounts where id=(select (result->>'id')::uuid from account_create)),'Operating','bank account fields persist');
select is((select count(*)::integer from public.sync_operations where client_mutation_id='bank-account-create'),1,'account create writes sync receipt');
select is(public.mutate_bank_account('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-create','create',null,null,'account-create-hash','{}')->>'id',(select result->>'id' from account_create),'account create is idempotent');
select throws_ok($$select public.mutate_bank_account('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-create','create',null,null,'different-hash','{}')$$,'P0001','Idempotency key was already used for different content','account key rejects different content');

create temporary table account_update as select public.mutate_bank_account(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-update','update',(select (result->>'id')::uuid from account_create),1,'account-update-hash',
'{"institutionName":"Evermont Bank","accountName":"Business Operating","accountType":"checking","mask":"1234","currency":"USD","isActive":true,"deviceId":"database-test"}'
) result;
select is((select (result->>'version')::integer from account_update),2,'bank account update increments version');
select throws_ok(format($$select public.mutate_bank_account('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-stale','update',%L,1,'stale','{"accountName":"Stale","accountType":"checking","currency":"USD"}')$$,(select result->>'id' from account_create)),'40001','Record version conflict','stale account edit is rejected');

insert into public.categories(id,workspace_id,name,kind,created_by) values
('33000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Advertising','expense','13000000-0000-4000-8000-000000000001'),
('33000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001','Commission income','income','13000000-0000-4000-8000-000000000001'),
('33000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001','Miscellaneous','expense','13000000-0000-4000-8000-000000000001');

create temporary table import_rows as select jsonb_build_array(
jsonb_build_object('postedDate','2026-08-31','description','Print shop open house','amount','-125.40','merchantName','Print Shop','providerTransactionId','bank-1','fingerprint','fingerprint-bank-1','rawData','{}'::jsonb),
jsonb_build_object('postedDate','2026-09-01','description','Commission deposit','amount','100.00','merchantName','Title Company','providerTransactionId','bank-2','fingerprint','fingerprint-bank-2','rawData','{}'::jsonb),
jsonb_build_object('postedDate','2026-09-02','description','Personal purchase','amount','-25.00','merchantName','Store','providerTransactionId','bank-3','fingerprint','fingerprint-bank-3','rawData','{}'::jsonb)
) rows;
create temporary table import_result as select public.import_bank_statement(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select (result->>'id')::uuid from account_create),'statement.csv','file-hash-1','database-test',(select rows from import_rows)
) result;
select is((select (result->>'imported')::integer from import_result),3,'statement import writes all new rows');
select is((select count(*)::integer from public.bank_transactions where workspace_id='23000000-0000-4000-8000-000000000001'),3,'statement rows become bank transactions');
select ok((select bool_and((amount>0 and direction='inflow') or (amount<0 and direction='outflow')) from public.bank_transactions where workspace_id='23000000-0000-4000-8000-000000000001'),'signed amounts produce correct directions');
select ok((select review_priority>=15 from public.bank_transactions where provider_transaction_id='bank-2'),'deal-likely description receives review priority');
select is(public.import_bank_statement('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select (result->>'id')::uuid from account_create),'statement.csv','file-hash-1','database-test',(select rows from import_rows))->>'id',(select result->>'id' from import_result),'same statement file is idempotent');
select is((public.import_bank_statement('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select (result->>'id')::uuid from account_create),'statement-copy.csv','file-hash-2','database-test',(select rows from import_rows))->>'duplicates')::integer,3,'duplicate rows in another file are skipped');

create temporary table categorize_result as select public.review_bank_transaction(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select id from public.bank_transactions where provider_transaction_id='bank-1'),
'bank-review-categorize',1,'categorize-hash','{"action":"categorize","categoryId":"33000000-0000-4000-8000-000000000001","deviceId":"database-test"}'
) result;
select is((select result->>'status' from categorize_result),'categorized','review can categorize a bank line');
select is((select (result->>'version')::integer from categorize_result),2,'categorization increments the bank line version');
select is((select category_id::text from public.bank_transactions where provider_transaction_id='bank-1'),'33000000-0000-4000-8000-000000000001','selected category persists');
select is(public.review_bank_transaction('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select id from public.bank_transactions where provider_transaction_id='bank-1'),'bank-review-categorize',1,'categorize-hash','{}')->>'status','categorized','review mutation is idempotent');
select throws_ok(format($$select public.review_bank_transaction('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',%L,'bank-review-misc',1,'misc-hash','{"action":"categorize","categoryId":"33000000-0000-4000-8000-000000000003"}')$$,(select id from public.bank_transactions where provider_transaction_id='bank-3')),'P0001','Choose a specific category; Miscellaneous is not available in quick review','Miscellaneous is blocked during quick review');
select throws_ok(format($$select public.review_bank_transaction('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',%L,'bank-review-stale',1,'stale-hash','{"action":"reconcile"}')$$,(select id from public.bank_transactions where provider_transaction_id='bank-1')),'40001','Record version conflict','stale bank review is rejected');

create temporary table reconcile_expense as select public.review_bank_transaction(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select id from public.bank_transactions where provider_transaction_id='bank-1'),
'bank-review-reconcile-expense',2,'reconcile-expense-hash','{"action":"reconcile","deviceId":"database-test"}'
) result;
select is((select result->>'status' from reconcile_expense),'reconciled','categorized line can be reconciled');
select ok((select exists(select 1 from public.transactions where id=(select (result->>'ledgerTransactionId')::uuid from reconcile_expense) and type='expense' and amount=125.40 and source='bank_import')),'reconciliation posts an exact ledger expense');
select ok((select exists(select 1 from public.bank_matches where bank_transaction_id=(select id from public.bank_transactions where provider_transaction_id='bank-1') and transaction_id=(select (result->>'ledgerTransactionId')::uuid from reconcile_expense) and voided_at is null)),'posted ledger transaction is matched to its bank line');
select is((select last_reconciled_through::text from public.bank_accounts where id=(select (result->>'id')::uuid from account_create)),'2026-08-31','account reconciliation date advances');

insert into public.commissions(id,workspace_id,status,sales_price,gross_commission,net_received,created_by)
values('43000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','paid',100,100,100,'13000000-0000-4000-8000-000000000001');
create temporary table match_commission as select public.review_bank_transaction(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select id from public.bank_transactions where provider_transaction_id='bank-2'),
'bank-review-match-commission',1,'match-commission-hash','{"action":"match","targetType":"commission","targetId":"43000000-0000-4000-8000-000000000001","matchConfidence":100,"deviceId":"database-test"}'
) result;
select is((select result->>'status' from match_commission),'matched','deposit can match an exact commission');
create temporary table reconcile_commission as select public.review_bank_transaction(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select id from public.bank_transactions where provider_transaction_id='bank-2'),
'bank-review-reconcile-commission',2,'reconcile-commission-hash','{"action":"reconcile","deviceId":"database-test"}'
) result;
select is((select result->>'status' from reconcile_commission),'reconciled','matched commission can be reconciled');
select is((select count(*)::integer from public.transactions where workspace_id='23000000-0000-4000-8000-000000000001'),1,'commission reconciliation does not duplicate income in the ledger');

select public.review_bank_transaction(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',(select id from public.bank_transactions where provider_transaction_id='bank-3'),
'bank-review-ignore',1,'ignore-hash','{"action":"ignore","reason":"Personal non-business purchase","deviceId":"database-test"}'
);
select is((select status from public.bank_transactions where provider_transaction_id='bank-3'),'ignored','non-business line can be ignored');
select is((select ignored_reason from public.bank_transactions where provider_transaction_id='bank-3'),'Personal non-business purchase','ignore reason is retained');
select throws_ok($$select public.mutate_bank_account('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','bank-account-unauthorized','create',null,null,'unauthorized','{"accountName":"Bad","accountType":"checking","currency":"USD"}')$$,'P0001','Not authorized to change bank accounts','service function re-verifies actor membership');

select public.mutate_bank_account(
'23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','bank-account-void','void',(select (result->>'id')::uuid from account_create),4,'account-void-hash','{"reason":"Closed bank account","deviceId":"database-test"}'
);
select ok((select deleted_at is not null and void_reason='Closed bank account' from public.bank_accounts where id=(select (result->>'id')::uuid from account_create)),'bank account void is non-destructive');

select * from finish();
rollback;
