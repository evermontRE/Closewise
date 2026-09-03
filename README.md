# Closewise

Real estate agent finance/deals SaaS, built on Next.js + Supabase + Stripe.

The customer-facing product name is intentionally temporary. Product branding
and interface design can change without changing the financial domain,
authentication, billing, or tenant-security foundation.

## Architecture

- **Next.js (App Router)** — frontend and API routes (`src/app`)
- **Supabase** — PostgreSQL + Auth
- **Stripe** — subscription billing through Checkout, Billing Portal, and
  signature-verified webhooks
- **Entitlements** — server-authoritative plan and feature access
- **Offline-first direction** — IndexedDB cache and a durable mutation outbox
- **Legacy reference** — `legacy/finance-studio.html` is the pre-SaaS product
  specification, not the production application

Read [docs/SAAS_ARCHITECTURE.md](docs/SAAS_ARCHITECTURE.md) for the architecture,
security, synchronization, calculation, and offline-migration decisions.

## Database migrations

Apply migrations in order:

1. `supabase/migrations/0001_init.sql` — profiles, workspaces, membership, and
   Stripe subscriptions.
2. `supabase/migrations/0002_finance_domain.sql` — tenant-isolated financial
   records, banking workflow, mileage, planning, audit, attachments, and sync
   operation receipts.
3. `supabase/migrations/0003_commission_workflow.sql` — atomic, idempotent
   commission creation and authenticated workspace financial summaries.
4. `supabase/migrations/0004_directory_workflow.sql` — versioned client and
   property creation, replacement updates, reason-required voiding, audit
   events, and offline-sync receipts.
5. `supabase/migrations/0005_ledger_workflow.sql` — versioned categories and
   financial transactions, exact-cent split lines, reference validation,
   reason-required voiding, audit events, and offline-sync receipts.
6. `supabase/migrations/0006_bank_workflow.sql` — bank accounts, duplicate-safe
   CSV imports, prioritized review, categorization, exact matching,
   reconciliation posting, audit events, and offline-sync receipts.
7. `supabase/migrations/0007_receipt_storage.sql` — private receipt bucket,
   verified upload metadata, record linking, short-lived access, receipt-status
   synchronization, audit events, and reason-required voiding.
8. `supabase/migrations/0008_mileage_workflow.sql` — multiple vehicles, annual
   odometers, versioned trip logs, the 2026 `$0.725/mile` default, exact
   deductions, reason-required voiding, audit events, and sync receipts.
9. `supabase/migrations/0009_recurring_obligations.sql` — subscriptions and
   recurring bills, exact annualized cost, renewal schedules and confirmations,
   reminders, reason-required voiding, audit events, and sync receipts.
10. `supabase/migrations/0010_tax_reserve_workflow.sql` — estimated tax-payment
    records, tax-reserve transfers, signed reserve balances, versioned edits,
    reason-required voiding, audit events, and sync receipts.
11. `supabase/migrations/0011_tax_planning_safe_harbor.sql` — versioned,
    user-controlled planning assumptions, prior-year safe-harbor inputs,
    optimistic concurrency, audit events, and sync receipts.
12. `supabase/migrations/0012_budget_goals_forecast.sql` — annual financial
    goals, category/month operating budgets, exact-cent plan mutations,
    optimistic concurrency, audit events, and sync receipts.
13. `supabase/migrations/0013_reporting_exports.sql` — append-only export
    history, tenant-readable audit metadata, content hashes, and service-only
    export recording.
14. `supabase/migrations/0014_offline_sync_legacy_import.sql` — staged legacy
    backup migration, permanent duplicate keys, per-record results, control
    totals, tenant isolation, and plain-language completion reports.
15. `supabase/migrations/0015_bank_connectivity.sql` — provider-neutral bank
    connections, encrypted Plaid credentials, incremental transaction cursors,
    verified webhook history, connection health, and reconciliation suggestions.
16. `supabase/migrations/0016_security_compliance.sql` — durable sensitive-action
    throttling, privacy-request records, bank-credential destruction, and
    scheduled retention cleanup.

The second migration also replaces the initial recursive membership policies
with security-definer membership checks and expands workspace roles to owner,
admin, member, bookkeeper, and accountant.

## Local setup

1. `npm install`
2. Create a Supabase project and apply the migrations in order.
3. Create a Stripe account in test mode and add recurring Prices for the plans.
4. Configure the Stripe webhook endpoint at `/api/stripe/webhook`.
5. Copy `.env.local.example` to `.env.local` and fill in the values.
6. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Database validation

Install the Supabase CLI and a Docker-compatible runtime, then run:

```bash
supabase db start
supabase test db
supabase db lint --level error
supabase stop --no-backup
```

The database tests rebuild the schema from the tracked migrations and verify
core tables, commission functions, role permissions, tenant isolation,
read-only accountant access, append-only audit behavior, and atomic commission
persistence. The same validation runs automatically for Supabase changes in
pull requests.

## Current status

Implemented foundation and first finance vertical:

- Supabase authentication
- workspace membership and role model
- Stripe subscription scaffold
- Stripe Checkout and Customer Portal with owner authorization, idempotency,
  duplicate-subscription prevention, webhook replay protection, ordered billing
  state, grace/read-only handling, billing audit history, and server-side plan
  enforcement
- Finance Studio domain schema
- tenant RLS foundation
- append-only audit model
- offline-sync contract
- decimal-safe commission calculations with regression fixtures
- validated, role-aware commission list/create API
- atomic deduction, sync-receipt, and audit-event persistence
- authenticated annual workspace summary API
- authenticated client and property list/detail/create/update/void APIs
- optimistic record-version checks for safe concurrent directory edits
- authenticated category and transaction list/detail/create/update/void APIs
- exact-cent transaction splits and cross-workspace reference protection
- normalized bank CSV import with file and row duplicate protection
- Bank Feed review, categorization, transaction/commission matching,
  reconciliation, and reason-required ignoring
- private PDF/image receipt uploads with byte-level type, size, and checksum
  verification before bookkeeping records are marked attached
- vehicle and trip list/detail/create/update/void APIs with annual and per-trip
  odometers, optional client/property links, parking and tolls, custom-rate
  preservation, and exact server-authoritative mileage deductions
- recurring-expense and subscription APIs with renewal history, due/overdue
  summaries, autopay/reminder metadata, and bank-first duplicate protection
- tax-payment and tax-reserve APIs with quarterly/jurisdiction metadata, exact
  signed reserve summaries, and explicit planning-only notices
- tax-planning API with exact-cent estimates, reserve coverage and gap,
  current-year and prior-year safe-harbor comparisons, eligibility warnings,
  and versioned owner/admin assumptions
- versioned annual goals and monthly operating budgets, plus a 1–12 month cash
  forecast combining actual activity, expected commissions, budget lines, and
  recurring obligations
- server-authoritative profit-and-loss, income/expense, category, cash-flow,
  commission, quarterly-organizer, and Schedule C mapping reports
- formula-injection-safe CSV, Excel-compatible spreadsheet XML, stable
  print/PDF data contracts, and append-only export audit history
- IndexedDB response cache, durable device-scoped mutation queue, automatic
  reconnect synchronization, bounded retries, and explicit conflict states
- legacy Finance Studio JSON preview and commit workflow with schema checks,
  duplicate fingerprints, staged records, control totals, and readable reports
- Plaid Link bank connections with encrypted access tokens, signed webhook
  verification, cursor-based transaction updates, stable provider deduplication,
  connection-health states, and approval-first reconciliation suggestions
- security headers, cross-site mutation protection, minimized provider payloads,
  durable throttling, customer bank disconnection, privacy-request tracking,
  retention automation, and an operational security policy/control register
- subscription lifecycle enforcement across workspace APIs, including plan
  modules, payment-required states, and export access during billing recovery
- legacy HTML retained for calculation and workflow parity

The visual product interface is still intentionally minimal so product design
can evolve independently of the authenticated finance and billing foundation.
