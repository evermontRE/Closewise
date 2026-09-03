import { NextResponse } from "next/server";
import { LedgerMutationError } from "@/data/ledger";
import { WorkspaceAccessError } from "@/data/workspace-access";
import { TRANSACTION_TYPES, LedgerInputError } from "./input";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ledgerQuery(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25, 1), 100);
  const requestedType = url.searchParams.get("type") ?? "";
  return {
    page, pageSize, from: (page - 1) * pageSize,
    search: (url.searchParams.get("search") ?? "").trim().slice(0, 120),
    type: TRANSACTION_TYPES.includes(requestedType as (typeof TRANSACTION_TYPES)[number]) ? requestedType : "",
    dateFrom: validDate(url.searchParams.get("from")),
    dateTo: validDate(url.searchParams.get("to")),
  };
}

export function mutationId(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || value.length < 8 || value.length > 160) throw new LedgerMutationError(400, "A valid Idempotency-Key header is required");
  return value;
}

export function expectedVersion(request: Request) {
  const version = Number.parseInt(request.headers.get("if-match")?.replaceAll('"', "").trim() ?? "", 10);
  if (!Number.isSafeInteger(version) || version < 1) throw new LedgerMutationError(428, "A valid If-Match record version is required");
  return version;
}

export function ledgerError(error: unknown, label: string) {
  if (error instanceof LedgerInputError) return NextResponse.json({ error: error.message, fields: error.fields }, { status: 400 });
  if (error instanceof LedgerMutationError || error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  console.error(`${label} API error`, error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
}

function validDate(value: string | null) {
  if (!value || !ISO_DATE.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}
