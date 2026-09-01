import { NextResponse } from "next/server";
import { BankWorkflowError } from "@/data/bank";
import { WorkspaceAccessError } from "@/data/workspace-access";
import { BankInputError } from "./input";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ["new", "categorized", "matched", "reconciled", "ignored"];

export function bankQuery(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25, 1), 100);
  const status = url.searchParams.get("status") ?? "";
  const accountId = url.searchParams.get("accountId") ?? "";
  return { page, pageSize, from: (page - 1) * pageSize, status: STATUSES.includes(status) ? status : "", accountId: UUID.test(accountId) ? accountId : "" };
}
export function mutationId(request: Request) { const value = request.headers.get("idempotency-key")?.trim(); if (!value || value.length < 8 || value.length > 160) throw new BankWorkflowError(400, "A valid Idempotency-Key header is required"); return value; }
export function expectedVersion(request: Request) { const version = Number.parseInt(request.headers.get("if-match")?.replaceAll('"', "").trim() ?? "", 10); if (!Number.isSafeInteger(version) || version < 1) throw new BankWorkflowError(428, "A valid If-Match record version is required"); return version; }
export function bankError(error: unknown, label: string) {
  if (error instanceof BankInputError) return NextResponse.json({ error: error.message, fields: error.fields }, { status: 400 });
  if (error instanceof BankWorkflowError || error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  console.error(`${label} API error`, error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
}
