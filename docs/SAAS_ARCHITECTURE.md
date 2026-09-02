# Closewise SaaS Architecture Lock

This document defines the production architecture for the cloud version of the
Finance Studio prototype currently stored at `legacy/finance-studio.html`.
The customer-facing product name is intentionally configurable so the
application can be renamed without rewriting financial domain code.

## Product boundary

The legacy HTML is a product specification and migration source. It is not
embedded as the authenticated application and does not become the server-side
source of truth.

The SaaS preserves these product behaviors:

- commissions remain distinct from non-commission income and expenses;
- gross commission, deductions, and net received are never collapsed;
- bank activity follows Import -> Review -> Match -> Reconcile -> Insight;
- voiding requires a reason and financial history remains auditable;
- tax, safe-to-spend, mileage, profitability, and forecasts are estimates based
  on user-controlled records and assumptions;
- local-first entry remains available during temporary network loss;
- every financial record belongs to exactly one workspace.

## Technology decisions

| Concern | Decision |
| --- | --- |
| Web application | Next.js App Router, React, and TypeScript |
| Identity | Supabase Auth |
| Primary database | Supabase PostgreSQL |
| Tenant isolation | Row Level Security on every workspace-owned table |
| Billing | Stripe Checkout, Billing Portal, and signed webhooks |
| Receipt storage | Private Supabase Storage bucket with workspace-scoped paths |
| Offline cache | IndexedDB in the browser |
| Synchronization | Mutation outbox with idempotency keys and optimistic versions |
| Hosting | Vercel |
| Monitoring | Vercel runtime logs plus an application error service before beta |
| Calculation code | Pure TypeScript domain modules with deterministic tests |

## Repository boundaries

```text
src/
  app/                    Routes, layouts, and server endpoints
  components/             Replaceable product interface
  features/               User-facing finance workflows
  domain/                 Pure financial calculations and validation
  data/                   Supabase repositories and typed queries
  sync/                   IndexedDB cache, outbox, replay, and conflict UI
  lib/                    Auth, billing, configuration, and shared infrastructure
supabase/
  migrations/             Ordered database migrations and RLS policies
  tests/                  SQL security and data-isolation tests
legacy/
  finance-studio.html     Read-only migration and behavior reference
docs/
  SAAS_ARCHITECTURE.md    This architecture lock
```

Design components may change without changing `domain`, `data`, `sync`, or
the database contract. Brand text must eventually come from a central product
configuration rather than being repeated throughout components.

## Workspace and permission model

A user may belong to multiple workspaces. All product data carries a
`workspace_id`.

| Role | Intended access |
| --- | --- |
| owner | Billing, workspace settings, members, and all financial records |
| admin | Workspace settings, members, and all financial records |
| member | Create and maintain ordinary financial records |
| bookkeeper | Create, categorize, match, and reconcile financial records |
| accountant | Read and export; no ordinary financial record mutation |

Row Level Security is mandatory even when an API route already checks
membership. Service-role credentials are restricted to trusted server code and
must never be included in browser bundles.

## Financial data model

Migration `0002_finance_domain.sql` adds:

- workspace settings and user-controlled financial assumptions;
- clients and properties;
- commissions and itemized commission deductions;
- general income/expense transactions and split lines;
- bank accounts, import batches, bank transactions, and matches;
- vehicles and mileage trips;
- recurring business expenses;
- tax payments and tax-reserve movements;
- annual goals, budgets, and monthly budget lines;
- receipt/document metadata;
- append-only audit events;
- idempotent sync-operation receipts.

The existing `subscriptions` table is reserved for Stripe billing.
Recurring business expenses therefore use `recurring_expenses`.

Money is stored as PostgreSQL `numeric`, never JavaScript floating-point values
in persistent calculations. UI code may display decimal values, but domain
calculations must use a decimal-safe representation and round only at explicit
business boundaries.

## Offline-first synchronization contract

Every client mutation receives a stable `client_mutation_id`, `device_id`,
entity ID, operation, and expected `base_version`.

1. The browser applies the validated mutation to IndexedDB.
2. The mutation is added to the local outbox.
3. When online, the server authenticates the user and workspace.
4. The server checks the idempotency key.
5. The server compares `base_version` with the current record version.
6. A matching version is applied atomically and returns the new version.
7. A mismatch returns a conflict payload without silently overwriting data.
8. The browser acknowledges successful outbox items and surfaces unresolved
   conflicts to the user.

Financial records are not resolved with last-write-wins. Conflicts involving
amounts, categories, dates, links, void status, or tax assumptions require an
explicit user choice. Duplicate retries return the original result.

## Audit rules

Hard deletion of ordinary financial records is not exposed to the application.
Records are voided or soft-deleted with a reason. Trusted server code writes
append-only audit events containing the actor, action, entity, reason, request
ID, and relevant before/after fields.

Audit records cannot be updated or deleted through the customer application.
Retention and export rules must be finalized before production.

## Calculation migration

The calculation engine will be extracted from the legacy HTML into pure
TypeScript modules in this order:

1. monetary and date primitives;
2. commission gross-to-net calculations;
3. operating income, expense, cash, and profitability summaries;
4. mileage valuation;
5. tax reserve and safe-harbor planning;
6. deal, property, and client rollups;
7. budgets, goals, cash runway, and forecasts;
8. reconciliation and report datasets.

Each module must have fixture-based parity tests against known legacy results.
No dashboard component should duplicate business formulas.

The mileage vertical is implemented in `0008_mileage_workflow.sql`. The 2026
default is `$0.725/mile`; rates retain their year and source so a deliberate
user override is never silently replaced. Vehicles retain annual beginning and
ending odometers, trips may retain their own odometer pair, and the server
computes the authoritative deduction with decimal arithmetic.

The recurring-obligations vertical is implemented in
`0009_recurring_obligations.sql`. It forecasts subscription and recurring-bill
commitments, retains renewal history, and computes annualized cost exactly.
Confirming a renewal advances its schedule but does not create a ledger
transaction; bank review and reconciliation remain the posting boundary.

The tax-cash vertical is implemented in `0010_tax_reserve_workflow.sql`.
Estimated payments and transfers into or out of the reserve remain separate,
auditable cash records. Reserve summaries retain negative balances when
underfunded and explicitly state that they are planning records—not tax advice,
a tax calculation, tax-return preparation, or filing.

Tax planning is implemented in `0011_tax_planning_safe_harbor.sql` and the
server-side tax-planning domain module. Rates, deductions, filing status, and
prior-year figures remain explicit user-controlled assumptions. The API can
compare 90% of the current planning estimate with an eligible prior-year
100%/110% target, but it does not determine tax liability, prepare a return,
or file with a taxing authority.

Goals, budgets, and cash forecasting are implemented in
`0012_budget_goals_forecast.sql` and the server-side forecast domain module.
Forecasts use recorded cash activity, expected commission dates, monthly
budgets, and recurring obligations. They preserve negative projected balances
and identify the first negative month instead of hiding cash risk.

Reporting and exports are implemented in `0013_reporting_exports.sql` and the
server-side reporting domain module. JSON reports, CSV, spreadsheet XML, and
print/PDF data all originate from the same normalized report document. Text
cells that could be interpreted as spreadsheet formulas are neutralized.
Export history stores hashes and metadata rather than duplicate financial
payloads and remains append-only.

## Security requirements before beta

- RLS tests prove that users cannot read or mutate another workspace.
- Workspace role escalation is tested and restricted.
- Stripe webhook events are signature-verified and idempotently processed.
- Checkout confirms workspace ownership before creating a subscription.
- Private files use short-lived signed URLs and workspace-scoped object paths.
- Sensitive values never use `NEXT_PUBLIC_` names.
- Authentication and callback redirects use an allowlist.
- Rate limits protect auth-adjacent, import, export, and billing endpoints.
- CSV formula injection is neutralized in exports.
- Imported files have size, type, encoding, and row-count limits.
- Logs exclude bank contents, tax identifiers, receipts, and financial payloads.
- Account export and deletion workflows cover database rows and stored files.

## Subscription enforcement

The server is authoritative for plan access. Hiding navigation is not
authorization. Every protected query, route, export, and background operation
checks workspace membership and required entitlement.

A customer whose paid subscription becomes unusable retains access to account,
billing, data export, and a defined read-only grace experience. Financial data
is never deleted merely because payment failed.

Pricing and plan names remain configurable while feature IDs stay stable.

## Migration from the offline edition

The offline JSON backup is the supported migration input.

1. Validate schema family and revision.
2. Show workspace, record counts, date range, and warnings.
3. Map legacy stable IDs to new UUIDs in an import staging area.
4. Detect duplicates before writing.
5. Import in a transaction.
6. Recalculate server-side totals.
7. Compare source and destination control totals.
8. Produce a plain-language import report.
9. Keep the original backup unchanged for recovery.

The importer must never trust totals from the uploaded file without
recalculation.

## Delivery phases

### Phase 0 — architecture and security lock

- Domain schema and RLS foundation
- Architecture and migration contract
- Security test plan
- Product-name configuration boundary

### Phase 1 — usable financial core

- Workspace shell
- Clients, properties, commissions, categories, and transactions
- Deterministic calculation modules
- Dashboard backed by real workspace data
- Audit events and void workflows

### Phase 2 — bookkeeping workflow

- Bank CSV import (implemented server contract)
- Review, categorization, matching, and reconciliation (implemented server contract)
- Receipt storage (implemented server contract)
- Mileage and recurring expenses
- Reports and exports

### Phase 3 — planning and offline operation

- Tax planning, goals, budgets, cash runway, and forecasts
- IndexedDB cache and durable synchronization
- Conflict-resolution interface
- Offline-to-cloud migration wizard

### Phase 4 — commercial readiness

- Stripe lifecycle hardening and plan enforcement
- Admin/support tooling
- Monitoring, backups, privacy workflows, and rate limits
- Accessibility, responsive, performance, and cross-browser QA
- Beta launch and production-readiness review

## Explicit non-goals for the foundation branch

- Redesigning the interface
- Live bank credentials or aggregation
- Filing tax returns
- Treating estimates as professional advice
- Moving secrets into client code
- Merging directly into the repository's default branch
