import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "finance-studio", stage: process.env.NEXT_PUBLIC_LAUNCH_STAGE ?? "development", commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
