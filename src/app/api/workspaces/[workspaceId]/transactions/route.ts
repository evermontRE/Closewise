import { NextResponse } from "next/server";
import { listTransactions, mutateLedgerRecord } from "@/data/ledger";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseTransactionInput } from "@/features/ledger/input";
import { ledgerError, ledgerQuery, mutationId } from "@/features/ledger/http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json(await listTransactions(supabase, { workspaceId, ...ledgerQuery(request) }));
  } catch (error) {
    return ledgerError(error, "Transactions");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const result = await mutateLedgerRecord({
      workspaceId, actorId: user.id, clientMutationId: mutationId(request),
      entity: "transaction", operation: "create", record: parseTransactionInput(await request.json()),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return ledgerError(error, "Transactions");
  }
}
