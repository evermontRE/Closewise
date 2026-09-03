# Finance Studio go-live handoff

Application implementation is complete when this document is merged. General availability is not complete until the vendor-dashboard work and release evidence below are finished by the release owner.

## 1. Supabase production

1. Create a production project that is separate from preview/testing.
2. Link the repository locally with `supabase link --project-ref <production-ref>`.
3. Review the target with `supabase db diff`, then apply migrations through `0020_customer_onboarding.sql` with `supabase db push`.
4. Run `supabase test db` and `supabase db lint --level error` against a clean local database before the push.
5. In Authentication, set the Site URL to the final HTTPS Finance Studio URL and add only required callback URLs ending in `/auth/callback`.
6. Keep public sign-ups disabled during private beta. Invite testers from Authentication → Users.
7. Configure branded confirmation, invitation, recovery, and email-change templates.
8. Enable managed backups, choose retention, record the first successful backup, and perform a real restore exercise.
9. After Eva has signed in, insert her user ID into `platform_staff` with the minimum required role. Never share the service-role key.
10. Copy the project URL, anon key, and service-role key into their matching Vercel Production variables.

## 2. Vercel project and variables

Connect `evermontRE/Closewise` and set `claude/saas-transformation-subscriptions-kddm5i` as the production branch until the repository is intentionally renamed or its default branch changes.

Set these for Production. Use separate Supabase, Stripe test, and Plaid Sandbox values for Preview.

| Variable | Production value or source | Exposure |
|---|---|---|
| `NEXT_PUBLIC_LAUNCH_STAGE` | `production` | Browser-visible |
| `NEXT_PUBLIC_REGISTRATION_MODE` | `beta` until public launch, then `open` | Browser-visible |
| `NEXT_PUBLIC_SITE_URL` | Final HTTPS app origin | Browser-visible |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | Browser-visible |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key | Browser-visible |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role | Sensitive server-only |
| `STRIPE_SECRET_KEY` | Restricted live secret key | Sensitive server-only |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the production endpoint | Sensitive server-only |
| `STRIPE_PRICE_ESSENTIALS` | Live recurring Price ID | Server-only |
| `STRIPE_PRICE_PROFESSIONAL` | Live recurring Price ID | Server-only |
| `STRIPE_PRICE_COMPLETE` | Live recurring Price ID | Server-only |
| `BILLING_GRACE_DAYS` | `7` unless policy changes | Server-only |
| `ENTITLEMENT_SIGNING_SECRET` | Unique 32+ character random secret | Sensitive server-only |
| `PLAID_CLIENT_ID` | Plaid production client ID | Sensitive server-only |
| `PLAID_SECRET` | Plaid production secret | Sensitive server-only |
| `PLAID_ENV` | `production` | Server-only |
| `BANK_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte key | Sensitive server-only |
| `CRON_SECRET` | Unique 32+ character random secret | Sensitive server-only |
| `HEALTHCHECK_SECRET` | Different unique 32+ character secret | Sensitive server-only |
| `OPERATIONS_SECRET` | Different unique 32+ character secret | Sensitive server-only |

Add `HEALTHCHECK_SECRET` to GitHub Actions secrets so Release verification can test protected readiness. If Vercel preview protection is enabled, also add a Vercel automation bypass secret to GitHub as `VERCEL_AUTOMATION_BYPASS_SECRET`.

## 3. Stripe live mode

1. Complete business verification and activate live payments.
2. Create the three recurring products/prices and copy the live `price_…` IDs to Vercel.
3. Configure the Customer Portal for plan changes, cancellation, payment methods, and invoice history.
4. Add `https://<app-domain>/api/stripe/webhook` and subscribe only to the events documented in the billing implementation.
5. Copy that endpoint's `whsec_…` secret to Vercel.
6. Test a real low-value purchase or approved live test, renewal state, payment failure/grace, recovery, plan change, cancellation, portal return, and duplicate webhook delivery.
7. Decide refund policy, sales-tax registrations, dispute ownership, and Stripe Radar settings before public sales.

## 4. Plaid production

1. Finish Plaid production approval for the Transactions use case actually used by Finance Studio.
2. Complete the public app profile, privacy URL, terms URL, support email, redirect URIs, and institution OAuth requirements.
3. Register `https://<app-domain>/api/bank-connections/plaid/webhook` as the production webhook.
4. Put the production client ID and secret in Vercel; never expose the Plaid secret or access tokens to the browser.
5. Test Link, initial sync, webhook sync, duplicate webhook delivery, cursor continuation, update mode, institution error, disconnect, and reconnection.
6. Confirm Plaid pricing, product selection, monthly limits, alerts, and support escalation contacts.

## 5. Domain, email, legal, and monitoring

1. Point the chosen subdomain to Vercel, verify ownership, and confirm HTTPS and redirects.
2. Create monitored `support@`, `privacy@`, and `security@` addresses on the Evermont domain.
3. Configure transactional email with SPF, DKIM, and DMARC; replace the temporary personal contact shown in prelaunch legal pages.
4. Have qualified counsel review Terms, Privacy, refund/cancellation policy, data-processing language, bank-data disclosures, and financial/tax disclaimers.
5. Enable Vercel runtime logs and Speed Insights. On Vercel Pro, configure a signed log/trace Drain or an error-monitoring integration; otherwise document who checks Dashboard runtime logs.
6. Create external monitors for public `/api/health/live` and protected `/api/health/ready`.
7. Confirm the daily maintenance Cron, support response target, security escalation, incident notification, and account-deletion ownership.

## 6. Release sequence

1. Deploy the frozen release commit to a Vercel preview using production-like but non-production data.
2. Complete `docs/PRIVATE_BETA_ACCEPTANCE.md` and fix every launch-blocking defect.
3. Run the GitHub **Release verification** workflow with that exact deployment URL.
4. Apply the reviewed production database migrations and verify `/api/health/ready` returns `200` with `productionConfiguration: "valid"`.
5. Promote the same verified Vercel artifact to production; do not rebuild a different commit.
6. Record deployment ID, commit SHA, migration version, configuration evidence, test result, and rollback target.
7. Scan runtime errors after launch, watch Stripe/Plaid webhooks, and keep registration in `beta` until the private-beta acceptance owner approves opening it.
