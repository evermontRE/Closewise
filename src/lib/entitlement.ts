import crypto from "crypto";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { evaluateSubscriptionAccess, type AccessMode, type SubscriptionStatus } from "@/domain/subscription-access";

export interface EntitlementRecord {
  workspaceId: string;
  licensedEdition: PlanId | null;
  status: SubscriptionStatus;
  accessMode: AccessMode;
  reason: "subscribed" | "payment_grace" | "payment_required" | "plan_unavailable";
  source: "server";
  issuedAt: string;
  expiresAt: string | null;
  sig: string;
}

/**
 * Mirrors legacy/finance-studio.html's Entitlement.checksum(), but with a
 * real keyed HMAC instead of the client's deliberately-weak FNV-1a hash —
 * this record leaves the server, so it needs to resist tampering, not just
 * accidental editing.
 */
function sign(record: Omit<EntitlementRecord, "sig">): string {
  const secret = process.env.ENTITLEMENT_SIGNING_SECRET;
  if (!secret) throw new Error("ENTITLEMENT_SIGNING_SECRET is not set");
  const basis = `${record.workspaceId}|${record.licensedEdition ?? ""}|${record.status}|${record.accessMode}|${record.reason}|${record.issuedAt}|${record.expiresAt ?? ""}`;
  return crypto.createHmac("sha256", secret).update(basis).digest("hex");
}

export function issueEntitlement(input: {
  workspaceId: string;
  plan: PlanId | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
}): EntitlementRecord {
  const access = evaluateSubscriptionAccess({ plan: input.plan, status: input.status, currentPeriodEnd: input.currentPeriodEnd, gracePeriodEnd: input.gracePeriodEnd });
  const record: Omit<EntitlementRecord, "sig"> = {
    workspaceId: input.workspaceId,
    licensedEdition: access.plan,
    status: input.status,
    accessMode: access.mode,
    reason: access.reason,
    source: "server",
    issuedAt: new Date().toISOString(),
    expiresAt: access.expiresAt,
  };
  return { ...record, sig: sign(record) };
}

export function verifyEntitlement(record: EntitlementRecord): boolean {
  const { sig, ...rest } = record;
  return sig === sign(rest);
}

export function licensedPlan(record: EntitlementRecord) {
  return record.licensedEdition ? PLANS[record.licensedEdition] : null;
}

export function canUseModule(record: EntitlementRecord, moduleId: string): boolean {
  return record.accessMode !== "billing_only" && Boolean(licensedPlan(record)?.modules.includes(moduleId));
}

export function canMutate(record: EntitlementRecord): boolean {
  return record.accessMode === "full";
}

export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}
