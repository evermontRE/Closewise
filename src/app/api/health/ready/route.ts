import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBearerSecret } from "@/lib/operations/internal-auth";
import { logOperation, safeError } from "@/lib/operations/logger";
import { productionConfiguration } from "@/lib/operations/production-config";

export async function GET(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), process.env.HEALTHCHECK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const { error } = await createAdminClient().from("subscriptions").select("workspace_id", { count: "exact", head: true });
    if (error) throw error;
    const configuration = productionConfiguration();
    const result = { status: configuration.ready ? "ready" : "degraded", database: "reachable", launchStage: configuration.stage, productionConfiguration: configuration.ready ? "valid" : "incomplete", missing: configuration.missing, invalid: configuration.invalid, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", latencyMs: Date.now() - started };
    return NextResponse.json(result, { status: configuration.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logOperation("error", "readiness_check_failed", { error: safeError(error), durationMs: Date.now() - started });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
