import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBearerSecret } from "@/lib/operations/internal-auth";
import { logOperation } from "@/lib/operations/logger";

export async function GET(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("purge_expired_security_data");
  if (error) {
    logOperation("error", "retention_cleanup_failed", { error: error.message });
    return NextResponse.json({ error: "Retention cleanup failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
