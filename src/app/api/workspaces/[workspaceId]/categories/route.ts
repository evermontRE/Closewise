import { NextResponse } from "next/server";
import { listCategories, mutateLedgerRecord } from "@/data/ledger";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseCategoryInput } from "@/features/ledger/input";
import { ledgerError, mutationId } from "@/features/ledger/http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json(await listCategories(supabase, workspaceId));
  } catch (error) {
    return ledgerError(error, "Categories");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const result = await mutateLedgerRecord({
      workspaceId, actorId: user.id, clientMutationId: mutationId(request),
      entity: "category", operation: "create", record: parseCategoryInput(await request.json()),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return ledgerError(error, "Categories");
  }
}
