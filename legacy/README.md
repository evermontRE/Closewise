# legacy/finance-studio.html

The pre-SaaS build of the finance module: a single offline-first HTML file
(vanilla JS, no framework, no build step) that stores everything in
`localStorage` and has no concept of accounts or a server. Kept here as the
reference for porting its financial engine into the Next.js app — it is not
served by the app and is not part of the build.

## What's worth reusing as-is

The engine (commission/ledger/mileage/tax math, report generation, CSV bank
import) is written to be plan-blind and storage-blind — it reads/writes plain
JS objects. That logic can move into `src/lib/` largely unchanged.

## What gets replaced, not ported

- **`Entitlement.readLocal()`/`Entitlement.resolve()`** — replaced by a
  `fetch('/api/entitlement?workspaceId=...')` call against
  `src/app/api/entitlement/route.ts`. The `EDITIONS` map already matches
  `src/lib/plans.ts` (`essentials` / `professional` / `complete`).
- **`localStorage` persistence** (`Store.*`) — replaced by Supabase Postgres,
  scoped by `workspace_id` (see `supabase/migrations/0001_init.sql`). The
  file's own `SETTINGS_SCOPE` map (`user` / `workspace` / `entitlement` /
  `device`) is the intended shape: `user` and `workspace` fields sync to the
  server, `device` fields stay local (e.g. as `localStorage` UI prefs),
  `entitlement` is never client-writable at all.
- **Backup import/export** — becomes a genuine import path (CSV/JSON upload)
  into the same Postgres tables, instead of the mechanism by which someone's
  entire book previously moved between browsers.

## Suggested port order

1. Extract the pure calculation functions (mileage, tax, commission math)
   into `src/lib/finance/` with unit tests — no UI, no storage.
2. Design the Postgres schema for the finance collections (`commissions`,
   `ledger`, `trips`, `properties`, `clients`, …) — the file's own
   `COLLECTIONS` array is the starting list.
3. Rebuild the views as React components against that schema, gated by
   `canUseModule()` (`src/lib/entitlement.ts`) instead of the old
   `Entitlement.can()`.
