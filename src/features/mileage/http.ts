import { NextResponse } from "next/server";
import { MileageMutationError } from "@/data/mileage";
import { WorkspaceAccessError } from "@/data/workspace-access";
import { MileageInputError } from "./input";

export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function mileageQuery(request:Request){const u=new URL(request.url),page=Math.max(Number.parseInt(u.searchParams.get("page")??"1",10)||1,1),pageSize=Math.min(Math.max(Number.parseInt(u.searchParams.get("pageSize")??"25",10)||25,1),100),year=Number.parseInt(u.searchParams.get("year")??"",10);return{page,pageSize,from:(page-1)*pageSize,vehicleId:UUID.test(u.searchParams.get("vehicleId")??"")?u.searchParams.get("vehicleId")??"":"",year:Number.isInteger(year)&&year>=1900&&year<=2100?year:null};}
export function mutationId(request:Request){const v=request.headers.get("idempotency-key")?.trim();if(!v||v.length<8||v.length>160)throw new MileageMutationError(400,"A valid Idempotency-Key header is required");return v;}
export function expectedVersion(request:Request){const v=Number.parseInt(request.headers.get("if-match")?.replaceAll('"',"").trim()??"",10);if(!Number.isSafeInteger(v)||v<1)throw new MileageMutationError(428,"A valid If-Match record version is required");return v;}
export function mileageError(error:unknown,label:string){if(error instanceof MileageInputError)return NextResponse.json({error:error.message,fields:error.fields},{status:400});if(error instanceof MileageMutationError||error instanceof WorkspaceAccessError)return NextResponse.json({error:error.message},{status:error.status});if(error instanceof SyntaxError)return NextResponse.json({error:"Request body must be valid JSON"},{status:400});console.error(`${label} API error`,error instanceof Error?error.message:"Unknown error");return NextResponse.json({error:"Unable to complete the request"},{status:500});}
