# Closewise

Real estate agent finance/deals SaaS, built on Next.js + Supabase + Stripe.

## Architecture

- **Next.js (App Router)** — frontend and API routes (`src/app`)
- **Supabase** — Postgres + auth. Schema in `supabase/migrations/0001_init.sql`:
  `profiles`, `workspaces`, `workspace_members`, `subscriptions` (one row per
  workspace, written only by the Stripe webhook handler via the service-role
  client — RLS blocks client writes)
- **Stripe** — subscription billing. Checkout (`/api/stripe/checkout`),
  customer portal (`/api/stripe/portal`), and webhook
  (`/api/stripe/webhook`) keep `subscriptions` in sync
- **Entitlements** (`src/lib/entitlement.ts`, `/api/entitlement`) — the
  server-authoritative source of what a workspace's plan unlocks. Plans are
  defined in `src/lib/plans.ts` (`essentials` / `professional` / `complete`)
- **`legacy/finance-studio.html`** — the pre-SaaS, offline-only build of the
  finance module. Not part of the app; see `legacy/README.md` for what gets
  ported into `src/lib` vs. replaced by the pieces above.

## Local setup

1. `npm install`
2. Create a [Supabase](https://supabase.com) project, then in the SQL editor
   run `supabase/migrations/0001_init.sql`.
3. Create a [Stripe](https://stripe.com) account (test mode is fine), add
   three recurring Prices (one per plan), and a webhook endpoint pointing at
   `/api/stripe/webhook` listening for `checkout.session.completed`,
   `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Copy `.env.local.example` to `.env.local` and fill in the Supabase and
   Stripe values.
5. `npm run dev` — open [http://localhost:3000](http://localhost:3000).

For local webhook testing, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
`stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Status

Foundation only: auth, workspaces, subscription billing, and the
entitlement API are wired end to end. The finance module itself (the actual
product) still needs to be ported from `legacy/finance-studio.html` — see
that folder's README for the plan.
