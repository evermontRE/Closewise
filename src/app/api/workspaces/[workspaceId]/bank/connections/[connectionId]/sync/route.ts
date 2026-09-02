import { NextResponse } from "next/server";
import { synchronizePlaidConnection } from "@/data/bank-connections";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { bankConnectionError, UUID } from "@/features/bank-connectivity/http";
type Context = { params: Promise<{ workspaceId: string; connectionId: string }> };
export async function POST(_request: Request, context: Context) { try { const { workspaceId, connectionId } = await context.params; if (!UUID.test(connectionId)) return NextResponse.json({ error: "Bank connection not found." }, { status: 404 }); const { role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role); return NextResponse.json(await synchronizePlaidConnection(connectionId, workspaceId)); } catch (cause) { return bankConnectionError(cause); } }
