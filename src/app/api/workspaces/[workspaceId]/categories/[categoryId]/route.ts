import { NextResponse } from "next/server";
import { getCategory, mutateLedgerRecord } from "@/data/ledger";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseCategoryInput, parseLedgerVoidInput } from "@/features/ledger/input";
import { expectedVersion, ledgerError, mutationId, UUID } from "@/features/ledger/http";

type Context = { params: Promise<{ workspaceId: string; categoryId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId, categoryId } = await context.params;
    if (!UUID.test(categoryId)) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json({ category: await getCategory(supabase, workspaceId, categoryId) });
  } catch (error) {
    return ledgerError(error, "Category");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, categoryId } = await context.params;
    if (!UUID.test(categoryId)) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    return NextResponse.json(await mutateLedgerRecord({
      workspaceId, actorId: user.id, clientMutationId: mutationId(request), entity: "category",
      operation: "update", entityId: categoryId, expectedVersion: expectedVersion(request),
      record: parseCategoryInput(await request.json()),
    }));
  } catch (error) {
    return ledgerError(error, "Category");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, categoryId } = await context.params;
    if (!UUID.test(categoryId)) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    return NextResponse.json(await mutateLedgerRecord({
      workspaceId, actorId: user.id, clientMutationId: mutationId(request), entity: "category",
      operation: "void", entityId: categoryId, expectedVersion: expectedVersion(request),
      record: parseLedgerVoidInput(await request.json()),
    }));
  } catch (error) {
    return ledgerError(error, "Category");
  }
}
