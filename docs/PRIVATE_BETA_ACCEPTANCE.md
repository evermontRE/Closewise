# Finance Studio private-beta acceptance

This is the release-owner checklist for admitting real customers. A green build is necessary but is not acceptance evidence by itself.

## Release candidate

- Record the commit SHA and Vercel preview deployment ID.
- Apply migrations to the preview Supabase project and save the migration version.
- Keep `NEXT_PUBLIC_REGISTRATION_MODE=beta`; invite testers through Supabase Auth.
- Use synthetic or specifically authorized financial data in preview.

## Customer journeys

- Invitation, confirmation, sign-in, sign-out, and password recovery.
- Workspace creation and all four onboarding steps.
- Stripe test-mode checkout, renewal, failed payment, recovery, cancellation, and portal return.
- Plaid Sandbox Link, initial sync, webhook sync, duplicate delivery, update mode, and disconnect.
- Import preview, duplicate handling, reconciliation, reports, CSV export, and privacy export/deletion request.
- Owner, bookkeeper, accountant, and unauthorized cross-workspace access.

## Experience and accessibility

- Test current Chrome, Edge, Safari, and Firefox.
- Test desktop, tablet portrait/landscape, and phone widths with keyboard-only navigation.
- Confirm visible focus, labels, error announcements, zoom to 200%, reduced motion, contrast, and logical headings.
- Confirm loading, empty, read-only, offline, retry, conflict, and provider-outage states.

## Acceptance record

- Record each blocking defect and its fix or explicit deferral owner.
- Obtain legal review of Terms, Privacy, refund/cancellation language, and financial/tax disclaimers.
- Obtain release approval from product, security, support, and operations owners.
- Freeze the approved commit, then promote that exact preview artifact rather than rebuilding it.
