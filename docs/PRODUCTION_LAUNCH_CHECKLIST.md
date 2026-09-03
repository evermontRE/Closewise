# Finance Studio production launch checklist

This checklist separates implemented application code from configuration that must be completed in vendor dashboards. Do not treat a successful build as production readiness.

## Supabase

- Create separate production and preview projects.
- Apply every migration through `0020_customer_onboarding.sql` and run `supabase test db` plus `supabase db lint --level error`.
- Configure allowed authentication redirect URLs and production email templates.
- Store the production URL and anon key in Vercel; store the service-role key only as a sensitive server variable.
- Enable an appropriate managed-backup plan and confirm the retention period.
- Record a visible-backup check weekly and complete a real restore exercise before launch and quarterly afterward.
- Bootstrap the first `platform_staff` administrator only after the correct user has signed in.
- Review database logs, storage policies, connection limits, and spending alerts.

## Vercel

- Link the correct GitHub repository and production branch.
- Configure production and preview variables separately; never expose server secrets with `NEXT_PUBLIC_`.
- Set `CRON_SECRET`, `HEALTHCHECK_SECRET`, and `OPERATIONS_SECRET` to distinct random values.
- Confirm the daily `/api/internal/maintenance` Cron appears on the production deployment.
- Monitor `/api/health/live` publicly and `/api/health/ready` with its bearer secret.
- Enable deployment protection for previews that contain real data.
- Configure runtime-log retention or an external error-monitoring integration before public launch.
- Establish preview verification followed by promotion of the same tested artifact; document rollback ownership.
- Run the GitHub Release verification workflow against the exact preview URL before promotion.

## Stripe

- Use live Product and Price IDs for all plans and configure the Customer Portal.
- Store the restricted production secret key and live webhook signing secret in Vercel.
- Register the production webhook URL and required subscription/invoice events.
- Complete live-mode checkout, payment failure, recovery, plan change, cancellation, and webhook retry tests.
- Decide tax registrations before enabling Stripe Tax; automated tax calculation does not create registrations.
- Configure dispute, refund, fraud, and revenue-notification ownership.

## Plaid

- Complete production approval for Transactions only.
- Configure production redirect URIs, webhook URL, application profile, support contact, and institution OAuth requirements.
- Store Plaid production credentials and the bank-token encryption key only in protected Vercel variables.
- Test Link, update mode, disconnection, cursor synchronization, duplicate resistance, webhook retry, and connection recovery.
- Confirm Plaid pricing and usage alerts before enabling customer connections.

## Domain, email, and customer trust

- Connect the production domain, enforce HTTPS, and verify DNS ownership.
- Configure a monitored support address and transactional-email domain with SPF, DKIM, and DMARC.
- Publish final Terms, Privacy Notice, Security page, refund/cancellation policy, and financial/tax disclaimers after professional review.
- Establish the support-response target, security contact, incident notification process, and data-deletion workflow.

## Launch evidence

- Complete desktop, tablet, and mobile end-to-end testing with real production-like accounts.
- Complete accessibility, browser, performance, billing, bank-sync, backup/restore, and tenant-isolation tests.
- Run a private beta, resolve launch-blocking defects, freeze the release candidate, and record approval.
- Save the production deployment ID, migration version, test report, vendor configuration evidence, and rollback target.
- Complete every manual action in `docs/GO_LIVE_HANDOFF.md`; application code alone cannot complete vendor verification or legal approval.
