begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(26);

select ok((select exists(select 1 from storage.buckets where id='finance-receipts')),'private receipt bucket exists');
select is((select public from storage.buckets where id='finance-receipts'),false,'receipt bucket is private');
select is((select file_size_limit from storage.buckets where id='finance-receipts'),10485760::bigint,'receipt bucket enforces ten megabyte limit');
select is((select cardinality(allowed_mime_types) from storage.buckets where id='finance-receipts'),4,'receipt bucket allows only four document and image types');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('14000000-0000-4000-8000-000000000001','receipt-owner@example.test','{}','{}'),
('14000000-0000-4000-8000-000000000002','receipt-outsider@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values
('24000000-0000-4000-8000-000000000001','Receipt Workspace','14000000-0000-4000-8000-000000000001');
insert into public.transactions(id,workspace_id,transaction_date,type,description,amount,receipt_status,created_by)
values('34000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','2026-09-01','expense','Settlement statement',2500,'missing','14000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-denied','create',null,null,'hash','{}')$$,'42501',null,'authenticated clients cannot call trusted receipt function');
reset role;

create temporary table receipt_one as select public.mutate_receipt_record(
'24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-create-one','create',null,null,'receipt-one-hash',
'{"recordType":"transaction","recordId":"34000000-0000-4000-8000-000000000001","fileName":"settlement.pdf","safeFileName":"settlement.pdf","mimeType":"application/pdf","sizeBytes":100,"declaredSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","deviceId":"database-test"}'
) result;
select is((select(result->>'version')::integer from receipt_one),1,'receipt intent starts at version one');
select is((select status from public.attachments where id=(select(result->>'id')::uuid from receipt_one)),'pending','receipt intent remains pending until bytes are verified');
select ok((select storage_path like '24000000-0000-4000-8000-000000000001/%/settlement.pdf' from public.attachments where id=(select(result->>'id')::uuid from receipt_one)),'receipt path is scoped by workspace and attachment');
select is((select count(*)::integer from public.sync_operations where client_mutation_id='receipt-create-one'),1,'receipt intent writes sync receipt');
select is((select count(*)::integer from public.audit_events where request_id='receipt-create-one'),1,'receipt intent writes audit event');
select is(public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-create-one','create',null,null,'receipt-one-hash','{}')->>'id',(select result->>'id' from receipt_one),'receipt intent is idempotent');
select throws_ok($$select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-create-one','create',null,null,'different-hash','{}')$$,'P0001','Idempotency key was already used for different content','receipt key rejects different content');
select throws_ok($$select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-cross-record','create',null,null,'cross-hash','{"recordType":"transaction","recordId":"34000000-0000-4000-8000-000000000099","fileName":"x.pdf","safeFileName":"x.pdf","mimeType":"application/pdf","sizeBytes":10}')$$,'P0001','Linked transaction not found','receipt cannot link to an unavailable record');
select throws_ok(format($$select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-wrong-size','finalize',%L,1,'wrong-size-hash','{"actualSizeBytes":99,"actualSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","actualMimeType":"application/pdf"}')$$,(select result->>'id' from receipt_one)),'P0001','Receipt size mismatch','receipt completion rejects a size mismatch');

create temporary table receipt_one_ready as select public.mutate_receipt_record(
'24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-finalize-one','finalize',(select(result->>'id')::uuid from receipt_one),1,'receipt-finalize-one-hash',
'{"actualSizeBytes":100,"actualSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","actualMimeType":"application/pdf","deviceId":"database-test"}'
) result;
select is((select(result->>'version')::integer from receipt_one_ready),2,'verified receipt increments version');
select is((select status from public.attachments where id=(select(result->>'id')::uuid from receipt_one)),'ready','verified receipt becomes ready');
select is((select sha256 from public.attachments where id=(select(result->>'id')::uuid from receipt_one)),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','verified checksum is retained');
select is((select receipt_status from public.transactions where id='34000000-0000-4000-8000-000000000001'),'attached','verified receipt updates the linked transaction');
select is((select count(*)::integer from public.audit_events where action='receipt_status_update' and entity_id='34000000-0000-4000-8000-000000000001'),1,'transaction receipt status change is audited');
select throws_ok(format($$select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-stale','finalize',%L,1,'stale-hash','{"actualSizeBytes":100,"actualSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","actualMimeType":"application/pdf"}')$$,(select result->>'id' from receipt_one)),'40001','Record version conflict','stale receipt completion is rejected');

create temporary table receipt_two as select public.mutate_receipt_record(
'24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-create-two','create',null,null,'receipt-two-hash',
'{"recordType":"transaction","recordId":"34000000-0000-4000-8000-000000000001","fileName":"purchase.png","safeFileName":"purchase.png","mimeType":"image/png","sizeBytes":50,"deviceId":"database-test"}'
) result;
select is((select(result->>'version')::integer from receipt_two),1,'second receipt intent starts at version one');
select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-finalize-two','finalize',(select(result->>'id')::uuid from receipt_two),1,'receipt-finalize-two-hash','{"actualSizeBytes":50,"actualSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","actualMimeType":"image/png","deviceId":"database-test"}');
select is((select status from public.attachments where id=(select(result->>'id')::uuid from receipt_two)),'ready','second receipt can be verified');

select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-void-one','void',(select(result->>'id')::uuid from receipt_one),2,'receipt-void-one-hash','{"reason":"Superseded by clearer copy","deviceId":"database-test"}');
select is((select receipt_status from public.transactions where id='34000000-0000-4000-8000-000000000001'),'attached','voiding one of multiple receipts keeps transaction attached');
select ok((select deleted_at is not null and void_reason='Superseded by clearer copy' from public.attachments where id=(select(result->>'id')::uuid from receipt_one)),'receipt void preserves metadata and reason');
select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','receipt-void-two','void',(select(result->>'id')::uuid from receipt_two),2,'receipt-void-two-hash','{"reason":"Document no longer applies","deviceId":"database-test"}');
select is((select receipt_status from public.transactions where id='34000000-0000-4000-8000-000000000001'),'missing','voiding last ready receipt marks transaction missing');
select throws_ok($$select public.mutate_receipt_record('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000002','receipt-unauthorized','create',null,null,'unauthorized-hash','{"recordType":"transaction","recordId":"34000000-0000-4000-8000-000000000001","fileName":"x.pdf","safeFileName":"x.pdf","mimeType":"application/pdf","sizeBytes":10}')$$,'P0001','Not authorized to change receipts','trusted function re-verifies actor membership');

select * from finish();
rollback;
