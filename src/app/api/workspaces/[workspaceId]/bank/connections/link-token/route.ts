import { NextResponse } from "next/server";
import { createPlaidLinkToken } from "@/data/bank-connections";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { bankConnectionError, UUID } from "@/features/bank-connectivity/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
type Context = { params: Promise<{ workspaceId: string }> };
export async function POST(request: Request, context: Context) { try { const { workspaceId } = await context.params; const { user, role } = await requireWorkspaceAccess(workspaceId); if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Only workspace owners and administrators can connect banks." }, { status: 403 }); await enforceRateLimit({ action: "plaid-link", subject: `${user.id}:${workspaceId}`, limit: 10, windowSeconds: 600 }); const body = await request.json().catch(() => ({})) as { connectionId?: string }; if (body.connectionId && !UUID.test(body.connectionId)) return NextResponse.json({ error: "Bank connection not found." }, { status: 404 }); return NextResponse.json(await createPlaidLinkToken({ workspaceId, userId: user.id, connectionId: body.connectionId ?? null })); } catch (cause) { return bankConnectionError(cause); } }
