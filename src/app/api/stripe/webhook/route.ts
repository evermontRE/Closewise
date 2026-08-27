import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFromStripePriceId } from "@/lib/plans";

// Stripe requires the raw body to verify the webhook signature, so this
// route must not run through any body-parsing middleware.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (workspaceId && typeof session.subscription === "string") {
        await syncSubscription(supabase, workspaceId, session.subscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata?.workspaceId;
      if (workspaceId) await syncSubscription(supabase, workspaceId, subscription.id);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

// Stripe's status enum is wider than ours (unpaid, incomplete_expired,
// paused). Anything we don't grant access for collapses to "canceled" so it
// always satisfies the subscriptions.status check constraint.
function mapStripeStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
      return status;
    default:
      return "canceled";
  }
}

async function syncSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  stripeSubscriptionId: string,
) {
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? planFromStripePriceId(priceId) : null;
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan,
      status: mapStripeStatus(subscription.status),
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);
}
