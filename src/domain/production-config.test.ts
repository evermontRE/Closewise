import test from "node:test";
import assert from "node:assert/strict";
import { launchStage, productionConfiguration } from "../lib/operations/production-config.ts";

const complete = {
  NEXT_PUBLIC_LAUNCH_STAGE: "production", NEXT_PUBLIC_REGISTRATION_MODE: "beta", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_SITE_URL: "https://finance.evermontre.com", STRIPE_SECRET_KEY: "sk_live_example", STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRICE_ESSENTIALS: "price_one", STRIPE_PRICE_PROFESSIONAL: "price_two", STRIPE_PRICE_COMPLETE: "price_three", ENTITLEMENT_SIGNING_SECRET: "e".repeat(32),
  PLAID_CLIENT_ID: "client", PLAID_SECRET: "plaid-secret", PLAID_ENV: "production", BANK_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  CRON_SECRET: "c".repeat(32), HEALTHCHECK_SECRET: "h".repeat(32), OPERATIONS_SECRET: "o".repeat(32),
};

test("a complete, live production environment passes preflight", () => assert.deepEqual(productionConfiguration(complete), { stage: "production", ready: true, missing: [], invalid: [] }));
test("production rejects sandbox providers and repeated weak secrets", () => {
  const report = productionConfiguration({ ...complete, PLAID_ENV: "sandbox", STRIPE_SECRET_KEY: "sk_test_example", CRON_SECRET: "short", HEALTHCHECK_SECRET: "short" });
  assert.equal(report.ready, false);
  assert.ok(report.invalid.includes("PLAID_ENV must be production"));
  assert.ok(report.invalid.includes("STRIPE_SECRET_KEY must be live mode"));
  assert.ok(report.invalid.includes("Operational bearer secrets must be distinct"));
});
test("an unknown launch stage remains safely in development", () => assert.equal(launchStage("unexpected"), "development"));
