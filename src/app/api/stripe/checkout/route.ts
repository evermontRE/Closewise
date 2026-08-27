import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { isPlanId, PLANS } from "@/lib/plans";

export async function POST(request: Request) {
  const { workspaceId, plan } = await request.json();

  if (typeof workspaceId !== "string" || typeof plan !== "string" || !isPlanId(plan)) {
    return NextResponse.json({ error: "workspaceId and a valid plan are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // RLS scopes this to workspaces the caller is a member of.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, stripe_customer_id")
    .eq("id", workspaceId)
    .single();
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const priceId = process.env[PLANS[plan].stripePriceEnvVar];
  if (!priceId) {
    return NextResponse.json({ error: `${PLANS[plan].stripePriceEnvVar} is not configured` }, { status: 500 });
  }

  let customerId = workspace.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { workspaceId },
    });
    customerId = customer.id;
    await supabase.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId);
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard/billing?checkout=success`,
    cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
    subscription_data: { metadata: { workspaceId } },
    metadata: { workspaceId },
  });

  return NextResponse.json({ url: session.url });
}
