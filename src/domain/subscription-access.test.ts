import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSubscriptionAccess, isMutationMethod, planAllowsModule, workspaceApiModule } from "./subscription-access.ts";

const now = new Date("2026-09-03T12:00:00.000Z");

test("active and trialing subscriptions receive full access", () => {
  for (const status of ["active", "trialing"] as const) {
    assert.deepEqual(evaluateSubscriptionAccess({ plan: "professional", status, currentPeriodEnd: "2026-10-01T00:00:00Z", gracePeriodEnd: null }, now), {
      plan: "professional", mode: "full", reason: "subscribed", expiresAt: "2026-10-01T00:00:00Z",
    });
  }
});

test("past-due customers receive time-bounded read-only access", () => {
  assert.equal(evaluateSubscriptionAccess({ plan: "professional", status: "past_due", currentPeriodEnd: null, gracePeriodEnd: "2026-09-10T00:00:00Z" }, now).mode, "read_only");
  assert.equal(evaluateSubscriptionAccess({ plan: "professional", status: "past_due", currentPeriodEnd: null, gracePeriodEnd: "2026-09-01T00:00:00Z" }, now).mode, "billing_only");
});

test("missing, canceled, and unrecognized plans cannot unlock financial modules", () => {
  assert.equal(evaluateSubscriptionAccess({ plan: null, status: "none", currentPeriodEnd: null, gracePeriodEnd: null }, now).mode, "billing_only");
  assert.equal(evaluateSubscriptionAccess({ plan: "complete", status: "canceled", currentPeriodEnd: null, gracePeriodEnd: null }, now).mode, "billing_only");
  assert.equal(evaluateSubscriptionAccess({ plan: "enterprise", status: "active", currentPeriodEnd: null, gracePeriodEnd: null }, now).mode, "billing_only");
});

test("plan module and API route mapping stays server authoritative", () => {
  assert.equal(planAllowsModule("essentials", "bank"), false);
  assert.equal(planAllowsModule("professional", "bank"), true);
  assert.equal(planAllowsModule("complete", "clients"), true);
  assert.equal(workspaceApiModule("/api/workspaces/28000000-0000-4000-8000-000000000001/tax/plan"), "tax");
  assert.equal(workspaceApiModule("/api/workspaces/28000000-0000-4000-8000-000000000001/exports"), "reports");
  assert.equal(isMutationMethod("POST"), true);
  assert.equal(isMutationMethod("GET"), false);
});
