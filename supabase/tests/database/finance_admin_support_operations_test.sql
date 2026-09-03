begin;
select plan(29);

select has_table('public','platform_staff','platform staff registry exists');
select has_table('public','workspace_operational_status','workspace operational status exists');
select has_table('public','support_notes','internal support notes exist');
select has_table('public','support_review_sessions','bounded review sessions exist');
select has_table('public','platform_audit_events','platform audit history exists');
select has_function('public','mutate_platform_support',array['uuid','text','uuid','text','text','text','uuid'],'support mutation boundary exists');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('1f000000-0000-4000-8000-000000000001','platform-admin@example.test','{}','{}'),
('1f000000-0000-4000-8000-000000000002','platform-support@example.test','{}','{}'),
('1f000000-0000-4000-8000-000000000003','platform-auditor@example.test','{}','{}'),
('1f000000-0000-4000-8000-000000000004','workspace-owner@example.test','{}','{}'),
('1f000000-0000-4000-8000-000000000005','workspace-member@example.test','{}','{}');
insert into public.workspaces(id,name,owner_id) values('2f000000-0000-4000-8000-000000000001','Support Test','1f000000-0000-4000-8000-000000000004');
insert into public.workspace_members(workspace_id,user_id,role) values('2f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000005','member');
insert into public.platform_staff(user_id,role) values
('1f000000-0000-4000-8000-000000000001','admin'),
('1f000000-0000-4000-8000-000000000002','support'),
('1f000000-0000-4000-8000-000000000003','auditor');

select throws_ok($$select public.mutate_platform_support('1f000000-0000-4000-8000-000000000004','not-staff-001','2f000000-0000-4000-8000-000000000001','add_note','Customer requested assistance.','Private note',null)$$,'P0001','Active platform staff access is required','workspace owners are not platform staff');
select throws_ok($$select public.mutate_platform_support('1f000000-0000-4000-8000-000000000003','auditor-write-01','2f000000-0000-4000-8000-000000000001','add_note','Audit review request.','Private note',null)$$,'P0001','Auditor access is read-only','auditors cannot mutate');
select throws_ok($$select public.mutate_platform_support('1f000000-0000-4000-8000-000000000002','support-suspend','2f000000-0000-4000-8000-000000000001','suspend','Potential account compromise.',null,null)$$,'P0001','Only platform administrators can change workspace status','support cannot suspend');
select throws_ok($$select public.mutate_platform_support('1f000000-0000-4000-8000-000000000001','reason-too-short','2f000000-0000-4000-8000-000000000001','suspend','short',null,null)$$,'P0001','A meaningful support reason is required','short reasons are rejected');

select is((public.mutate_platform_support('1f000000-0000-4000-8000-000000000002','support-note-001','2f000000-0000-4000-8000-000000000001','add_note','Customer requested billing help.','Follow up after invoice review.',null)->>'action'),'add_note','support can add an internal note');
select is((select count(*)::integer from public.support_notes where workspace_id='2f000000-0000-4000-8000-000000000001'),1,'support note is retained');
select is((select count(*)::integer from public.platform_audit_events where request_id='support-note-001'),1,'support note action is audited');
select is((public.mutate_platform_support('1f000000-0000-4000-8000-000000000002','support-note-001','2f000000-0000-4000-8000-000000000001','add_note','Customer requested billing help.','Follow up after invoice review.',null)->>'duplicate'),'true','support action retries return the original result');
select is((select count(*)::integer from public.support_notes where workspace_id='2f000000-0000-4000-8000-000000000001'),1,'support action retries do not duplicate notes');

select is((public.mutate_platform_support('1f000000-0000-4000-8000-000000000001','admin-suspend-01','2f000000-0000-4000-8000-000000000001','suspend','Confirmed account security concern.',null,null)->>'action'),'suspend','admin can suspend');
select is((select status from public.workspace_operational_status where workspace_id='2f000000-0000-4000-8000-000000000001'),'suspended','workspace is suspended');
select is((select reason from public.workspace_operational_status where workspace_id='2f000000-0000-4000-8000-000000000001'),'Confirmed account security concern.','suspension reason is retained');
select ok((select before_data is null and after_data->>'status'='suspended' from public.platform_audit_events where request_id='admin-suspend-01'),'suspension change is auditable');

create temporary table review_result as select public.mutate_platform_support('1f000000-0000-4000-8000-000000000002','support-review-1','2f000000-0000-4000-8000-000000000001','start_review','Investigating synchronization report.',null,null) result;
select is((select result->'result'->>'accessLevel' from review_result),'operational_read_only','review access is read-only');
select ok((select expires_at<=started_at+interval '30 minutes' from public.support_review_sessions where id=(select (result->>'id')::uuid from review_result)),'review session is time bounded');
select is((select count(*)::integer from public.platform_audit_events where request_id='support-review-1'),1,'review start is audited');
select is((public.mutate_platform_support('1f000000-0000-4000-8000-000000000002','support-review-2','2f000000-0000-4000-8000-000000000001','end_review','Operational review completed.',null,(select (result->>'id')::uuid from review_result))->'result'->>'ended'),'true','review can be ended explicitly');

select is((public.mutate_platform_support('1f000000-0000-4000-8000-000000000001','admin-reactivate','2f000000-0000-4000-8000-000000000001','reactivate','Security concern has been resolved.',null,null)->>'action'),'reactivate','admin can reactivate');
select is((select status from public.workspace_operational_status where workspace_id='2f000000-0000-4000-8000-000000000001'),'active','workspace is active again');

set local role authenticated;
select set_config('request.jwt.claim.sub','1f000000-0000-4000-8000-000000000005',true);
select is((select count(*)::integer from public.workspace_operational_status where workspace_id='2f000000-0000-4000-8000-000000000001'),1,'workspace members can read operational status');
select throws_ok($$select count(*) from public.support_notes$$,'42501',null,'customers cannot read internal notes');
select throws_ok($$select count(*) from public.platform_audit_events$$,'42501',null,'customers cannot read platform audit history');
select throws_ok($$select public.mutate_platform_support('1f000000-0000-4000-8000-000000000005','forbidden-call-1','2f000000-0000-4000-8000-000000000001','add_note','Attempted customer mutation.','Not allowed',null)$$,'42501',null,'authenticated customers cannot call support mutation');
reset role;

select * from finish();
rollback;
