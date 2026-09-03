import { NextResponse } from "next/server";
import { listReceipts } from "@/data/receipts";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { parseReceiptQuery } from "@/features/receipts/input";
import { receiptError } from "@/features/receipts/http";

type Context={params:Promise<{workspaceId:string}>};
export async function GET(request:Request,context:Context){try{const{workspaceId}=await context.params;const{supabase}=await requireWorkspaceAccess(workspaceId);return NextResponse.json(await listReceipts(supabase,{workspaceId,...parseReceiptQuery(request)}));}catch(error){return receiptError(error,"Receipts");}}
