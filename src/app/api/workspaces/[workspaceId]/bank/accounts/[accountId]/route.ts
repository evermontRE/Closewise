import { NextResponse } from "next/server";
import { getBankAccount, mutateBankAccount } from "@/data/bank";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseBankAccountInput, parseBankVoidInput } from "@/features/bank/input";
import { bankError, expectedVersion, mutationId, UUID } from "@/features/bank/http";

type Context = { params: Promise<{ workspaceId: string; accountId: string }> };

export async function GET(_request: Request, context: Context) {
  try { const { workspaceId, accountId } = await context.params; if (!UUID.test(accountId)) return NextResponse.json({ error: "Bank account not found" }, { status: 404 }); const { supabase } = await requireWorkspaceAccess(workspaceId); return NextResponse.json({ account: await getBankAccount(supabase, workspaceId, accountId) }); }
  catch (error) { return bankError(error, "Bank account"); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, accountId } = await context.params; if (!UUID.test(accountId)) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role);
    return NextResponse.json(await mutateBankAccount({ workspaceId, actorId: user.id, clientMutationId: mutationId(request), operation: "update", entityId: accountId, expectedVersion: expectedVersion(request), record: parseBankAccountInput(await request.json()) }));
  } catch (error) { return bankError(error, "Bank account"); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, accountId } = await context.params; if (!UUID.test(accountId)) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role);
    return NextResponse.json(await mutateBankAccount({ workspaceId, actorId: user.id, clientMutationId: mutationId(request), operation: "void", entityId: accountId, expectedVersion: expectedVersion(request), record: parseBankVoidInput(await request.json()) }));
  } catch (error) { return bankError(error, "Bank account"); }
}
