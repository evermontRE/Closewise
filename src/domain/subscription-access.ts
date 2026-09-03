import { isPlanId, PLANS, type PlanId } from "../lib/plans.ts";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "none";
export type AccessMode = "full" | "read_only" | "billing_only";

export interface SubscriptionSnapshot {
  plan: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
}

export interface SubscriptionAccess {
  plan: PlanId | null;
  mode: AccessMode;
  reason: "subscribed" | "payment_grace" | "payment_required" | "plan_unavailable";
  expiresAt: string | null;
}

export function evaluateSubscriptionAccess(snapshot: SubscriptionSnapshot, now = new Date()): SubscriptionAccess {
  const plan = snapshot.plan && isPlanId(snapshot.plan) ? snapshot.plan : null;
  if ((snapshot.status === "active" || snapshot.status === "trialing") && plan) {
    return { plan, mode: "full", reason: "subscribed", expiresAt: snapshot.currentPeriodEnd };
  }
  if (snapshot.status === "past_due" && plan && snapshot.gracePeriodEnd) {
    const graceEnd = new Date(snapshot.gracePeriodEnd);
    if (!Number.isNaN(graceEnd.valueOf()) && graceEnd > now) {
      return { plan, mode: "read_only", reason: "payment_grace", expiresAt: snapshot.gracePeriodEnd };
    }
  }
  return {
    plan,
    mode: "billing_only",
    reason: plan ? "payment_required" : "plan_unavailable",
    expiresAt: null,
  };
}

export function planAllowsModule(plan: PlanId | null, moduleId: string) {
  return plan ? PLANS[plan].modules.includes(moduleId) : false;
}

export function workspaceApiModule(pathname: string): string | null {
  const match = pathname.match(/^\/api\/workspaces\/[0-9a-f-]+\/([^/]+)/i);
  const segment = match?.[1];
  if (!segment) return null;
  const modules: Record<string, string> = {
    bank: "bank",
    budgets: "budget",
    categories: "ledger",
    clients: "clients",
    commissions: "commissions",
    exports: "reports",
    forecast: "budget",
    goals: "goals",
    imports: "settings",
    mileage: "mileage",
    properties: "properties",
    receipts: "ledger",
    "recurring-expenses": "subscriptions",
    reports: "reports",
    summary: "dashboard",
    tax: "tax",
    transactions: "ledger",
    vehicles: "mileage",
  };
  return modules[segment] ?? null;
}

export function isMutationMethod(method: string) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
