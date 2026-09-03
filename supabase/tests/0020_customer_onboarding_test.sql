begin;
select plan(7);

select has_table('public', 'workspace_onboarding', 'workspace onboarding table exists');
select has_column('public', 'workspace_onboarding', 'current_step', 'current step is stored');
select has_column('public', 'workspace_onboarding', 'completed_at', 'completion timestamp is stored');
select col_is_pk('public', 'workspace_onboarding', 'workspace_id', 'one onboarding record exists per workspace');
select policies_are('public', 'workspace_onboarding', array[
  'workspace onboarding: members can read',
  'workspace onboarding: administrators can create',
  'workspace onboarding: administrators can update'
], 'onboarding access is protected by workspace role');
select col_not_null('public', 'workspace_onboarding', 'current_step', 'current step is required');
select col_default_is('public', 'workspace_onboarding', 'current_step', '1', 'onboarding begins at step one');

select * from finish();
rollback;
