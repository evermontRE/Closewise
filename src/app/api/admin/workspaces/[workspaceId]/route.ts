import { NextResponse } from "next/server";
import { getOperationalWorkspace } from "@/data/admin-operations";
import { parseSupportAction, roleCanPerform } from "@/domain/admin-operations";
import { PlatformAccessError, requirePlatformStaff } from "@/lib/admin/access";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ workspaceId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    if (!UUID.test(workspaceId)) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    const { admin, user } = await requirePlatformStaff();
    await enforceRateLimit({ action: "admin-workspace-detail", subject: user.id, limit: 240, windowSeconds: 3600 });
    const workspace = await getOperationalWorkspace(admin, workspaceId);
    return workspace ? NextResponse.json({ workspace }) : NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  } catch (error) {
    return adminError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    if (!UUID.test(workspaceId)) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    const { admin, user, role } = await requirePlatformStaff();
    await enforceRateLimit({ action: "admin-workspace-mutation", subject: user.id, limit: 60, windowSeconds: 3600 });
    const input = parseSupportAction(await request.json());
    if (!roleCanPerform(role, input.action)) return NextResponse.json({ error: "Your platform role cannot perform this action." }, { status: 403 });
    const requestId = request.headers.get("idempotency-key")?.trim();
    if (!requestId || requestId.length < 8 || requestId.length > 200) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
    }
    const { data, error } = await admin.rpc("mutate_platform_support", {
      p_actor_id: user.id,
      p_request_id: requestId,
      p_workspace_id: workspaceId,
      p_action: input.action,
      p_reason: input.reason,
      p_note: input.note,
      p_session_id: input.sessionId,
    });
    if (error) throw error;
    return NextResponse.json({ result: data });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /support action|reason between|internal note|review session/i.test(error.message))) {
      return NextResponse.json({ error: error instanceof SyntaxError ? "Request body must be valid JSON." : error.message }, { status: 400 });
    }
    return adminError(error);
  }
}

function adminError(error: unknown) {
  if (error instanceof PlatformAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
  console.error("Admin workspace operation failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to complete the support operation." }, { status: 500 });
}
