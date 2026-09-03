import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { billingSiteUrl, checkoutIntegrationIdentifier, getStripe } from "@/lib/stripe";
import { isPlanId, PLANS } from "@/lib/plans";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    const { workspaceId, plan } = await request.json();
    if (typeof workspaceId !== "string" || typeof plan !== "string" || !isPlanId(plan)) {
      return NextResponse.json({ error: "workspaceId and a valid plan are required" }, { status: 400 });
    }

    const { user, role } = await requireWorkspaceAccess(workspaceId);
    if (role !== "owner") return NextResponse.json({ error: "Only the workspace owner can change its subscription." }, { status: 403 });
    await enforceRateLimit({ action: "stripe-checkout", subject: `${user.id}:${workspaceId}`, limit: 5, windowSeconds: 3600 });
    const admin = createAdminClient();
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id, stripe_customer_id")
      .eq("id", workspaceId)
      .single();
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const { data: current } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id,status")
      .eq("workspace_id", workspaceId)
      .single();
    if (current?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(current.status)) {
      return NextResponse.json({ error: "Manage the existing subscription in the billing portal." }, { status: 409 });
    }

    const priceId = process.env[PLANS[plan].stripePriceEnvVar];
    if (!priceId) {
      return NextResponse.json({ error: `${PLANS[plan].stripePriceEnvVar} is not configured` }, { status: 500 });
    }

    const requestKey = request.headers.get("idempotency-key")?.trim();
    if (!requestKey || requestKey.length < 8 || requestKey.length > 160) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
    }

    const { data: checkoutClaimed, error: checkoutClaimError } = await admin.rpc("claim_billing_checkout", {
      p_workspace_id: workspaceId,
    });
    if (checkoutClaimError) throw checkoutClaimError;
    if (!checkoutClaimed) {
      return NextResponse.json({ error: "A subscription checkout is already pending. Try again shortly or use the billing portal." }, { status: 409 });
    }

    const stripe = getStripe();

    let customerId = workspace.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { workspaceId },
      }, { idempotencyKey: `customer:${workspaceId}:${requestKey}` });
      customerId = customer.id;
      const { error } = await admin.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId).is("stripe_customer_id", null);
      if (error) throw error;
    }

    const origin = billingSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
      subscription_data: { metadata: { workspaceId } },
      metadata: { workspaceId, plan, initiatedBy: user.id },
      integration_identifier: checkoutIntegrationIdentifier(),
    }, { idempotencyKey: `checkout:${workspaceId}:${plan}:${requestKey}` });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    if (status === 401 || status === 403 || status === 404) return NextResponse.json({ error: (error as Error).message }, { status });
    console.error("Stripe checkout error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to start subscription checkout." }, { status: 500 });
  }
}
