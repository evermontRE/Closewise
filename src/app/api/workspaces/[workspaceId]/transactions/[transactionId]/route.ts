import { NextResponse } from "next/server";
import { getTransaction, mutateLedgerRecord } from "@/data/ledger";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseLedgerVoidInput, parseTransactionInput } from "@/features/ledger/input";
import { expectedVersion, ledgerError, mutationId, UUID } from "@/features/ledger/http";

type Context = { params: Promise<{ workspaceId: string; transactionId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId, transactionId } = await context.params;
    if (!UUID.test(transactionId)) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json({ transaction: await getTransaction(supabase, workspaceId, transactionId) });
  } catch (error) {
    return ledgerError(error, "Transaction");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, transactionId } = await context.params;
    if (!UUID.test(transactionId)) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    return NextResponse.json(await mutateLedgerRecord({
      workspaceId, actorId: user.id, clientMutationId: mutationId(request), entity: "transaction",
      operation: "update", entityId: transactionId, expectedVersion: expectedVersion(request),
      record: parseTransactionInput(await request.json()),
    }));
  } catch (error) {
    return ledgerError(error, "Transaction");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, transactionId } = await context.params;
    if (!UUID.test(transactionId)) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    return NextResponse.json(await mutateLedgerRecord({
      workspaceId, actorId: user.id, clientMutationId: mutationId(request), entity: "transaction",
      operation: "void", entityId: transactionId, expectedVersion: expectedVersion(request),
      record: parseLedgerVoidInput(await request.json()),
    }));
  } catch (error) {
    return ledgerError(error, "Transaction");
  }
}
