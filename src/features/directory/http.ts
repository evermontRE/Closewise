import { NextResponse } from "next/server";
import { DirectoryMutationError } from "@/data/directory";
import { WorkspaceAccessError } from "@/data/workspace-access";
import { DirectoryInputError } from "./input";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function pagination(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25, 1),
    100,
  );
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    search: (url.searchParams.get("search") ?? "").trim().slice(0, 120),
  };
}

export function mutationId(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || value.length < 8 || value.length > 160) {
    throw new DirectoryMutationError(400, "A valid Idempotency-Key header is required");
  }
  return value;
}

export function expectedVersion(request: Request) {
  const value = request.headers.get("if-match")?.replaceAll('"', "").trim();
  const version = Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new DirectoryMutationError(428, "A valid If-Match record version is required");
  }
  return version;
}

export function directoryError(error: unknown, label: string) {
  if (error instanceof DirectoryInputError) {
    return NextResponse.json({ error: error.message, fields: error.fields }, { status: 400 });
  }
  if (error instanceof DirectoryMutationError || error instanceof WorkspaceAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  console.error(`${label} API error`, error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
}
