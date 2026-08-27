import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { issueEntitlement } from "@/lib/entitlement";
import { isPlanId } from "@/lib/plans";

/**
 * Server-authoritative replacement for legacy/finance-studio.html's
 * Entitlement.readLocal(). The client fetches this once per session (and on
 * reconnect) instead of trusting a value it stored itself.
 */
export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // RLS scopes this to the caller's own workspaces — a non-member gets no row.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("workspace_id", workspaceId)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Workspace not found or not a member" }, { status: 404 });
  }

  const plan = subscription.plan && isPlanId(subscription.plan) ? subscription.plan : null;
  const record = issueEntitlement({
    workspaceId,
    plan,
    status: subscription.status as "active" | "trialing" | "past_due" | "canceled" | "none",
    currentPeriodEnd: subscription.current_period_end,
  });

  return NextResponse.json(record);
}
