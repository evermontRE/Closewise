import { NextResponse } from "next/server";
import { searchOperationalWorkspaces } from "@/data/admin-operations";
import { PlatformAccessError, requirePlatformStaff } from "@/lib/admin/access";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  try {
    const { admin, user } = await requirePlatformStaff();
    await enforceRateLimit({ action: "admin-workspace-search", subject: user.id, limit: 120, windowSeconds: 3600 });
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ workspaces: await searchOperationalWorkspaces(admin, query) });
  } catch (error) {
    return adminError(error);
  }
}

function adminError(error: unknown) {
  if (error instanceof PlatformAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
  console.error("Admin workspace search failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to load operational workspaces." }, { status: 500 });
}
