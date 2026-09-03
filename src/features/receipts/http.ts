import { NextResponse } from "next/server";
import { ReceiptWorkflowError } from "@/data/receipts";
import { WorkspaceAccessError } from "@/data/workspace-access";
import { ReceiptInputError } from "./input";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function mutationId(request: Request) { const value=request.headers.get("idempotency-key")?.trim(); if(!value||value.length<8||value.length>160) throw new ReceiptWorkflowError(400,"A valid Idempotency-Key header is required"); return value; }
export function expectedVersion(request: Request) { const version=Number.parseInt(request.headers.get("if-match")?.replaceAll('"',"").trim()??"",10); if(!Number.isSafeInteger(version)||version<1) throw new ReceiptWorkflowError(428,"A valid If-Match record version is required"); return version; }
export function receiptError(error:unknown,label:string){ if(error instanceof ReceiptInputError) return NextResponse.json({error:error.message,fields:error.fields},{status:400}); if(error instanceof ReceiptWorkflowError||error instanceof WorkspaceAccessError) return NextResponse.json({error:error.message},{status:error.status}); if(error instanceof SyntaxError) return NextResponse.json({error:"Request body must be valid JSON"},{status:400}); console.error(`${label} API error`,error instanceof Error?error.message:"Unknown error"); return NextResponse.json({error:"Unable to complete the request"},{status:500}); }
