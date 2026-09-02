import { NextResponse } from "next/server";
import { listBankConnections } from "@/data/bank-connections";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { bankConnectionError } from "@/features/bank-connectivity/http";
type Context = { params: Promise<{ workspaceId: string }> };
export async function GET(_request: Request, context: Context) { try { const { workspaceId } = await context.params; await requireWorkspaceAccess(workspaceId); return NextResponse.json(await listBankConnections(workspaceId)); } catch (cause) { return bankConnectionError(cause); } }
