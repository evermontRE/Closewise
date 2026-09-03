import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { billingSiteUrl, getStripe } from "@/lib/stripe";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    const { workspaceId } = await request.json();
    if (typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const { supabase, user, role } = await requireWorkspaceAccess(workspaceId);
    if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Only workspace owners and administrators can manage billing." }, { status: 403 });
    await enforceRateLimit({ action: "stripe-portal", subject: `${user.id}:${workspaceId}`, limit: 10, windowSeconds: 3600 });

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("stripe_customer_id")
      .eq("id", workspaceId)
      .single();
    if (!workspace?.stripe_customer_id) {
      return NextResponse.json({ error: "This workspace has no billing account yet" }, { status: 404 });
    }

    const origin = billingSiteUrl();
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      return_url: `${origin}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    if (status === 401 || status === 403 || status === 404) return NextResponse.json({ error: (error as Error).message }, { status });
    console.error("Stripe portal error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to open the billing portal." }, { status: 500 });
  }
}
