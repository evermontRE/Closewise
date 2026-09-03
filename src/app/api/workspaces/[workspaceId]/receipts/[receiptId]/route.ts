import { NextResponse } from "next/server";
import { getReceipt,voidReceipt } from "@/data/receipts";
import { requireFinancialWriter,requireWorkspaceAccess } from "@/data/workspace-access";
import { parseReceiptVoidInput } from "@/features/receipts/input";
import { expectedVersion,mutationId,receiptError,UUID } from "@/features/receipts/http";

type Context={params:Promise<{workspaceId:string;receiptId:string}>};
export async function GET(_request:Request,context:Context){try{const{workspaceId,receiptId}=await context.params;if(!UUID.test(receiptId))return NextResponse.json({error:"Receipt not found"},{status:404});const{supabase}=await requireWorkspaceAccess(workspaceId);return NextResponse.json({receipt:await getReceipt(supabase,workspaceId,receiptId)});}catch(error){return receiptError(error,"Receipt");}}
export async function DELETE(request:Request,context:Context){try{const{workspaceId,receiptId}=await context.params;if(!UUID.test(receiptId))return NextResponse.json({error:"Receipt not found"},{status:404});const{user,role}=await requireWorkspaceAccess(workspaceId);requireFinancialWriter(role);return NextResponse.json(await voidReceipt({workspaceId,actorId:user.id,receiptId,clientMutationId:mutationId(request),expectedVersion:expectedVersion(request),receipt:parseReceiptVoidInput(await request.json())}));}catch(error){return receiptError(error,"Receipt");}}
