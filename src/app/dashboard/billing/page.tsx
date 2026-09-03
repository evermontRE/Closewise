import { createClient } from "@/lib/supabase/server";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { SubscribeButton, ManageBillingButton } from "./billing-actions";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, stripe_customer_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Create a workspace first from the Overview tab.</p>;
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end, grace_period_end, cancel_at_period_end, trial_end, last_invoice_status")
    .eq("workspace_id", workspace.id)
    .single();

  const activePlan = subscription?.status && ["active", "trialing"].includes(subscription.status)
    ? subscription.plan
    : null;

  return (
    <div>
      <h1 className="text-xl font-semibold">Billing — {workspace.name}</h1>
      <p className="mt-2 text-sm text-zinc-500">
        {activePlan
          ? `Current plan: ${PLANS[activePlan as keyof typeof PLANS].name} (${subscription!.status})`
          : "No active subscription."}
      </p>

      {subscription?.status === "past_due" && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Payment needs attention. Financial records remain readable until {subscription.grace_period_end ? new Date(subscription.grace_period_end).toLocaleDateString("en-US") : "the grace period ends"}, but changes are paused.
        </p>
      )}
      {subscription?.cancel_at_period_end && subscription.current_period_end && (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          Cancellation is scheduled for {new Date(subscription.current_period_end).toLocaleDateString("en-US")}.
        </p>
      )}

      {workspace.stripe_customer_id && (
        <div className="mt-4">
          <ManageBillingButton workspaceId={workspace.id} />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const isCurrent = activePlan === id;
          return (
            <div key={id} className="flex flex-col rounded-lg border border-zinc-200 p-4">
              <p className="font-medium">{plan.name}</p>
              <p className="mt-1 text-sm text-zinc-500">${plan.priceMonthlyUsd}/mo</p>
              {isCurrent ? (
                <span className="mt-4 text-sm font-medium text-emerald-600">Current plan</span>
              ) : activePlan ? (
                <span className="mt-4 text-sm text-zinc-500">Change in billing portal</span>
              ) : (
                <div className="mt-4">
                  <SubscribeButton workspaceId={workspace.id} plan={id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
