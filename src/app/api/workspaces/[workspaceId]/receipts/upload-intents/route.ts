import { NextResponse } from "next/server";
import { createReceiptUploadIntent } from "@/data/receipts";
import { requireFinancialWriter,requireWorkspaceAccess } from "@/data/workspace-access";
import { parseReceiptIntentInput } from "@/features/receipts/input";
import { mutationId,receiptError } from "@/features/receipts/http";

type Context={params:Promise<{workspaceId:string}>};
export async function POST(request:Request,context:Context){try{const{workspaceId}=await context.params;const{user,role}=await requireWorkspaceAccess(workspaceId);requireFinancialWriter(role);const result=await createReceiptUploadIntent({workspaceId,actorId:user.id,clientMutationId:mutationId(request),receipt:parseReceiptIntentInput(await request.json())});return NextResponse.json(result,{status:201});}catch(error){return receiptError(error,"Receipt upload intent");}}
