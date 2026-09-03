import { NextResponse } from "next/server";
import { importBankStatement, listBankImports } from "@/data/bank";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseBankImportInput } from "@/features/bank/input";
import { bankError, bankQuery } from "@/features/bank/http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try { const { workspaceId } = await context.params; const { supabase } = await requireWorkspaceAccess(workspaceId); return NextResponse.json(await listBankImports(supabase, workspaceId, bankQuery(request).accountId)); }
  catch (error) { return bankError(error, "Bank imports"); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params; const { user, role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role);
    return NextResponse.json(await importBankStatement({ workspaceId, actorId: user.id, import: parseBankImportInput(await request.json()) }), { status: 201 });
  } catch (error) { return bankError(error, "Bank imports"); }
}
