import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(header: string | null) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  if (!header || !expected || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("purge_expired_security_data");
  if (error) {
    console.error("Retention cleanup failed", error.message);
    return NextResponse.json({ error: "Retention cleanup failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
