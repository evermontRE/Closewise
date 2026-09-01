import { NextResponse } from "next/server";
import { listBankAccounts, mutateBankAccount } from "@/data/bank";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseBankAccountInput } from "@/features/bank/input";
import { bankError, mutationId } from "@/features/bank/http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, context: Context) {
  try { const { workspaceId } = await context.params; const { supabase } = await requireWorkspaceAccess(workspaceId); return NextResponse.json(await listBankAccounts(supabase, workspaceId)); }
  catch (error) { return bankError(error, "Bank accounts"); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params; const { user, role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role);
    const result = await mutateBankAccount({ workspaceId, actorId: user.id, clientMutationId: mutationId(request), operation: "create", record: parseBankAccountInput(await request.json()) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return bankError(error, "Bank accounts"); }
}
