# Production recovery runbook

## Triage

1. Confirm `/api/health/live`; if it fails, inspect the current Vercel deployment and runtime logs.
2. Call `/api/health/ready` with `HEALTHCHECK_SECRET`; a failure identifies application configuration or database readiness without exposing details publicly.
3. Open **Dashboard → Reliability** and review open alerts, the last maintenance run, webhook status, Plaid health, and backup evidence.
4. Record incident start time, affected services, customer impact, and incident owner. Do not place customer financial data or secrets in logs or tickets.

## Containment

- Roll back the Vercel deployment when a new application release caused the incident.
- Stop a risky integration at the provider or rotate its secret if compromise is suspected.
- Suspend only affected workspaces when necessary; provide a reason and preserve export access.
- Never repair financial records with untracked direct edits. Use audited workflows or a reviewed migration.

## Recovery

- Verify the target database backup before restoration and preserve the current state for investigation.
- Restore into an isolated project first, validate control totals and tenant isolation, then approve production recovery.
- Replay Stripe and Plaid events through their idempotent handlers after the database is stable.
- Resolve operational alerts only after a successful readiness check and customer workflow smoke test.

## Closure

- Record timeline, root cause, customer impact, recovery evidence, and follow-up controls.
- Rotate exposed credentials, notify affected parties when required, and schedule the corrective work.
- Record the backup or restore verification through `/api/internal/backup-verification`.
