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

## Current status

Implemented foundation and first finance vertical:

- Supabase authentication
- workspace membership and role model
- Stripe subscription scaffold
- server-side entitlements
- Finance Studio domain schema
- tenant RLS foundation
- append-only audit model
- offline-sync contract
- decimal-safe commission calculations with regression fixtures
- validated, role-aware commission list/create API
- atomic deduction, sync-receipt, and audit-event persistence
- authenticated annual workspace summary API
- legacy HTML retained for calculation and workflow parity

The visual product interface is still intentionally minimal so product design
can evolve independently of the authenticated finance and billing foundation.
