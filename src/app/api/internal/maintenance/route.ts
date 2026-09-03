import { NextResponse } from "next/server";
import { hasBearerSecret } from "@/lib/operations/internal-auth";
import { runProductionMaintenance } from "@/lib/operations/maintenance";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const day = new Date().toISOString().slice(0, 10);
  try {
    return NextResponse.json({ ok: true, result: await runProductionMaintenance(`daily-production-maintenance:${day}`) });
  } catch {
    return NextResponse.json({ error: "Production maintenance failed." }, { status: 500 });
  }
}
