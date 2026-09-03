import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBearerSecret } from "@/lib/operations/internal-auth";
import { logOperation, safeError } from "@/lib/operations/logger";

export async function GET(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), process.env.HEALTHCHECK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const { error } = await createAdminClient().from("subscriptions").select("workspace_id", { count: "exact", head: true });
    if (error) throw error;
    const configured = [
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_PRICE_ESSENTIALS,
      process.env.STRIPE_PRICE_PROFESSIONAL,
      process.env.STRIPE_PRICE_COMPLETE,
      process.env.PLAID_CLIENT_ID,
      process.env.PLAID_SECRET,
      process.env.BANK_TOKEN_ENCRYPTION_KEY,
      process.env.CRON_SECRET,
      process.env.OPERATIONS_SECRET,
    ].every(Boolean);
    const result = { status: configured ? "ready" : "degraded", database: "reachable", productionConfiguration: configured ? "present" : "incomplete", latencyMs: Date.now() - started };
    return NextResponse.json(result, { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logOperation("error", "readiness_check_failed", { error: safeError(error), durationMs: Date.now() - started });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
