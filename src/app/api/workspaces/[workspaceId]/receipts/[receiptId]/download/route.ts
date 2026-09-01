import { NextResponse } from "next/server";
import { createReceiptDownload } from "@/data/receipts";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { receiptError,UUID } from "@/features/receipts/http";

type Context={params:Promise<{workspaceId:string;receiptId:string}>};
export async function POST(_request:Request,context:Context){try{const{workspaceId,receiptId}=await context.params;if(!UUID.test(receiptId))return NextResponse.json({error:"Receipt not found"},{status:404});await requireWorkspaceAccess(workspaceId);return NextResponse.json(await createReceiptDownload({workspaceId,receiptId}));}catch(error){return receiptError(error,"Receipt download");}}
