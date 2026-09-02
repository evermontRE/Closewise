import { NextResponse } from "next/server";
import { synchronizePlaidConnection } from "@/data/bank-connections";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { bankConnectionError, UUID } from "@/features/bank-connectivity/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
type Context = { params: Promise<{ workspaceId: string; connectionId: string }> };
export async function POST(_request: Request, context: Context) { try { const { workspaceId, connectionId } = await context.params; if (!UUID.test(connectionId)) return NextResponse.json({ error: "Bank connection not found." }, { status: 404 }); const { user, role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role); await enforceRateLimit({ action: "plaid-sync", subject: `${user.id}:${connectionId}`, limit: 12, windowSeconds: 600 }); return NextResponse.json(await synchronizePlaidConnection(connectionId, workspaceId)); } catch (cause) { return bankConnectionError(cause); } }
