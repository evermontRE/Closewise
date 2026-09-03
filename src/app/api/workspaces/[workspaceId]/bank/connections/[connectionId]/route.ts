import { NextResponse } from "next/server";
import { disconnectPlaidConnection } from "@/data/bank-connections";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { bankConnectionError, UUID } from "@/features/bank-connectivity/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ workspaceId: string; connectionId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceId, connectionId } = await context.params;
    if (!UUID.test(connectionId)) return NextResponse.json({ error: "Bank connection not found." }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Only workspace owners and administrators can disconnect banks." }, { status: 403 });
    await enforceRateLimit({ action: "plaid-disconnect", subject: `${user.id}:${connectionId}`, limit: 5, windowSeconds: 600 });
    return NextResponse.json(await disconnectPlaidConnection({ workspaceId, connectionId, actorId: user.id }));
  } catch (cause) {
    return bankConnectionError(cause);
  }
}
