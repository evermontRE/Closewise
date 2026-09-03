import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFromStripePriceId } from "@/lib/plans";
import { logOperation } from "@/lib/operations/logger";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id, p_event_type: event.type, p_livemode: event.livemode,
  });
  if (claimError) {
    logOperation("error", "stripe_webhook_claim_failed", { eventId: event.id, eventType: event.type, error: claimError.message });
    return NextResponse.json({ error: "Webhook processing unavailable" }, { status: 500 });
  }
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });

  try {
    await processEvent(event);
    await admin.rpc("complete_stripe_webhook_event", { p_event_id: event.id, p_succeeded: true, p_error_message: null });
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await admin.rpc("complete_stripe_webhook_event", { p_event_id: event.id, p_succeeded: false, p_error_message: message });
    logOperation("error", "stripe_webhook_processing_failed", { eventId: event.id, eventType: event.type, error: message });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = idOf(session.subscription);
      if (subscriptionId) await applySubscription(event, await getStripe().subscriptions.retrieve(subscriptionId), session.metadata?.workspaceId, "checkout_complete");
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event, event.data.object as Stripe.Subscription, undefined, event.type);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
      if (subscriptionId) await applySubscription(event, await getStripe().subscriptions.retrieve(subscriptionId), undefined, event.type);
      return;
    }
    default:
      return;
  }
}

async function applySubscription(event: Stripe.Event, subscription: Stripe.Subscription, workspaceHint?: string, invoiceStatus?: string) {
  const admin = createAdminClient();
  const customerId = idOf(subscription.customer);
  if (!customerId) throw new Error("Subscription has no customer");
  let workspaceId = workspaceHint ?? subscription.metadata?.workspaceId;
  if (!workspaceId) {
    const { data } = await admin.from("subscriptions").select("workspace_id").eq("stripe_subscription_id", subscription.id).maybeSingle();
    workspaceId = data?.workspace_id;
  }
  if (!workspaceId) {
    const { data } = await admin.from("workspaces").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    workspaceId = data?.id;
  }
  if (!workspaceId) throw new Error("Unable to resolve subscription workspace");

  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.items.data[0]?.current_period_end ?? null;
  const status = mapStripeStatus(subscription.status);
  const eventDate = new Date(event.created * 1000);
  const graceDays = Math.min(Math.max(Number.parseInt(process.env.BILLING_GRACE_DAYS ?? "7", 10) || 7, 1), 30);
  const gracePeriodEnd = status === "past_due" ? new Date(eventDate.getTime() + graceDays * 86_400_000).toISOString() : null;

  const { error } = await admin.rpc("apply_stripe_subscription_snapshot", {
    p_workspace_id: workspaceId, p_event_id: event.id, p_event_type: event.type,
    p_event_created_at: eventDate.toISOString(), p_customer_id: customerId,
    p_subscription_id: subscription.id, p_price_id: priceId,
    p_plan: priceId ? planFromStripePriceId(priceId) : null, p_status: status,
    p_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    p_canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    p_grace_period_end: gracePeriodEnd, p_last_invoice_status: invoiceStatus ?? null,
  });
  if (error) throw new Error(error.message);
}

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function mapStripeStatus(status: Stripe.Subscription.Status) {
  return (["active", "trialing", "past_due", "canceled", "incomplete"] as string[]).includes(status)
    ? status as "active" | "trialing" | "past_due" | "canceled" | "incomplete"
    : "canceled";
}
