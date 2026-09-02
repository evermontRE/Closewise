import { NextResponse } from "next/server";
import { PlaidError } from "@/lib/banking/plaid";
import { WorkspaceAccessError } from "@/data/workspace-access";
import { RateLimitError } from "@/lib/security/rate-limit";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function bankConnectionError(cause: unknown) {
  if (cause instanceof WorkspaceAccessError) return NextResponse.json({ error: cause.message }, { status: cause.status });
  if (cause instanceof RateLimitError) return NextResponse.json(
    { error: cause.message },
    { status: cause.status, headers: { "Retry-After": String(cause.retryAfterSeconds) } },
  );
  if (cause instanceof PlaidError) return NextResponse.json({ error: customerPlaidMessage(cause.code), code: cause.code }, { status: cause.code === "ITEM_LOGIN_REQUIRED" ? 409 : 502 });
  console.error("Bank connection error", cause instanceof Error ? cause.message : "Unknown error");
  return NextResponse.json({ error: cause instanceof Error && cause.message.includes("not configured") ? "Bank connections are not configured yet." : "Finance Studio could not complete the bank connection request." }, { status: 500 });
}
function customerPlaidMessage(code: string) {
  if (code === "ITEM_LOGIN_REQUIRED") return "This bank needs you to sign in again.";
  if (code === "INSTITUTION_DOWN") return "This bank is temporarily unavailable. Try again later.";
  if (code === "INSTITUTION_NOT_RESPONDING") return "This bank is taking too long to respond. Try again later.";
  if (code === "PRODUCT_NOT_READY") return "Your bank is still preparing transaction history.";
  return "The bank connection provider could not complete this request.";
}
