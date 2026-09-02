import { after } from "next/server";
import { NextResponse } from "next/server";
import { recordPlaidWebhook, synchronizePlaidItem, updatePlaidItemHealth } from "@/data/bank-connections";
import { verifyPlaidWebhook } from "@/lib/banking/plaid-webhook";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyPlaidWebhook(rawBody, request.headers.get("plaid-verification")))) return NextResponse.json({ error: "Invalid Plaid webhook signature." }, { status: 401 });
  let payload: { webhook_type?: string; webhook_code?: string; item_id?: string };
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const type = String(payload.webhook_type ?? "UNKNOWN"), code = String(payload.webhook_code ?? "UNKNOWN"), itemId = payload.item_id ? String(payload.item_id) : null;
  await recordPlaidWebhook({ itemId, type, code, rawBody, payload });
  if (itemId && type === "ITEM" && code !== "WEBHOOK_UPDATE_ACKNOWLEDGED") await updatePlaidItemHealth(itemId, code, payload as Record<string, unknown>);
  if (itemId && type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") after(async () => { try { await synchronizePlaidItem(itemId); } catch (cause) { console.error("Plaid webhook synchronization failed", cause instanceof Error ? cause.message : "Unknown error"); } });
  return NextResponse.json({ received: true });
}
