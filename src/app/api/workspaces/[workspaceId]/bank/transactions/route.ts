import { NextResponse } from "next/server";
import { listBankTransactions } from "@/data/bank";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { bankError, bankQuery } from "@/features/bank/http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try { const { workspaceId } = await context.params; const { supabase } = await requireWorkspaceAccess(workspaceId); return NextResponse.json(await listBankTransactions(supabase, { workspaceId, ...bankQuery(request) })); }
  catch (error) { return bankError(error, "Bank transactions"); }
}
