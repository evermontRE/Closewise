import crypto from "crypto";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";

export interface EntitlementRecord {
  workspaceId: string;
  licensedEdition: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  source: "server";
  issuedAt: string;
  expiresAt: string | null;
  sig: string;
}

const DEFAULT_PLAN: PlanId = "essentials";

/**
 * Mirrors legacy/finance-studio.html's Entitlement.checksum(), but with a
 * real keyed HMAC instead of the client's deliberately-weak FNV-1a hash —
 * this record leaves the server, so it needs to resist tampering, not just
 * accidental editing.
 */
function sign(record: Omit<EntitlementRecord, "sig">): string {
  const secret = process.env.ENTITLEMENT_SIGNING_SECRET;
  if (!secret) throw new Error("ENTITLEMENT_SIGNING_SECRET is not set");
  const basis = `${record.workspaceId}|${record.licensedEdition}|${record.status}|${record.issuedAt}|${record.expiresAt ?? ""}`;
  return crypto.createHmac("sha256", secret).update(basis).digest("hex");
}

export function issueEntitlement(input: {
  workspaceId: string;
  plan: PlanId | null;
  status: EntitlementRecord["status"];
  currentPeriodEnd: string | null;
}): EntitlementRecord {
  const usable = input.status === "active" || input.status === "trialing";
  const record: Omit<EntitlementRecord, "sig"> = {
    workspaceId: input.workspaceId,
    licensedEdition: usable && input.plan ? input.plan : DEFAULT_PLAN,
    status: usable ? input.status : "none",
    source: "server",
    issuedAt: new Date().toISOString(),
    expiresAt: usable ? input.currentPeriodEnd : null,
  };
  return { ...record, sig: sign(record) };
}

export function verifyEntitlement(record: EntitlementRecord): boolean {
  const { sig, ...rest } = record;
  return sig === sign(rest);
}

export function licensedPlan(record: EntitlementRecord) {
  return PLANS[record.licensedEdition] ?? PLANS[DEFAULT_PLAN];
}

export function canUseModule(record: EntitlementRecord, moduleId: string): boolean {
  return licensedPlan(record).modules.includes(moduleId);
}

export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}
