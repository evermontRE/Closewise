import { createClient } from "@/lib/supabase/server";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { SubscribeButton, ManageBillingButton } from "./billing-actions";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Create a workspace first from the Overview tab.</p>;
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
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

      {activePlan && (
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
