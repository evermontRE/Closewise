import { NextResponse } from "next/server";
import { exchangePlaidToken } from "@/data/bank-connections";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { bankConnectionError } from "@/features/bank-connectivity/http";
type Context = { params: Promise<{ workspaceId: string }> };
export async function POST(request: Request, context: Context) { try { const { workspaceId } = await context.params; const { user, role } = await requireWorkspaceAccess(workspaceId); if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Only workspace owners and administrators can connect banks." }, { status: 403 }); const body = await request.json() as { publicToken?: string }; if (!body.publicToken || body.publicToken.length > 500) return NextResponse.json({ error: "Plaid did not return a valid connection token." }, { status: 400 }); return NextResponse.json(await exchangePlaidToken({ workspaceId, actorId: user.id, publicToken: body.publicToken }), { status: 201 }); } catch (cause) { return bankConnectionError(cause); } }
