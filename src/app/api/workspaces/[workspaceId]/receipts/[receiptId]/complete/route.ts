import { NextResponse } from "next/server";
import { completeReceiptUpload } from "@/data/receipts";
import { requireFinancialWriter,requireWorkspaceAccess } from "@/data/workspace-access";
import { parseReceiptCompleteInput } from "@/features/receipts/input";
import { expectedVersion,mutationId,receiptError,UUID } from "@/features/receipts/http";

type Context={params:Promise<{workspaceId:string;receiptId:string}>};
export async function POST(request:Request,context:Context){try{const{workspaceId,receiptId}=await context.params;if(!UUID.test(receiptId))return NextResponse.json({error:"Receipt not found"},{status:404});const{user,role}=await requireWorkspaceAccess(workspaceId);requireFinancialWriter(role);return NextResponse.json(await completeReceiptUpload({workspaceId,actorId:user.id,receiptId,clientMutationId:mutationId(request),expectedVersion:expectedVersion(request),complete:parseReceiptCompleteInput(await request.json())}));}catch(error){return receiptError(error,"Receipt completion");}}
