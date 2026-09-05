import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import { evaluateSubscriptionAccess } from "@/domain/subscription-access";
import { PLANS, type PlanId } from "@/lib/plans";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function dollars(value: unknown) { return money.format(Number(value ?? 0) / 100); }

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase } = await requireWorkspaceAccess(workspaceId);
  const [{ data: workspace }, { data: subscription }, { data: onboarding }] = await Promise.all([
    supabase.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
    supabase.from("subscriptions").select("plan,status,current_period_end,grace_period_end").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("workspace_onboarding").select("current_step,completed_at,setup_method,opening_balance_cents").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!workspace) notFound();
  const access = evaluateSubscriptionAccess({ plan: subscription?.plan ?? null, status: subscription?.status ?? "none", currentPeriodEnd: subscription?.current_period_end ?? null, gracePeriodEnd: subscription?.grace_period_end ?? null });
  let summary: Record<string, unknown> | null = null;
  if (access.mode !== "billing_only") {
    const { data } = await supabase.rpc("workspace_financial_summary", { p_workspace_id: workspaceId, p_year: new Date().getUTCFullYear() });
    summary = data as Record<string, unknown> | null;
  }
  const safeToSpend = Number(onboarding?.opening_balance_cents ?? 0) + Number(summary?.collectedIncome ?? 0) - Number(summary?.operatingExpenses ?? 0) - Number(summary?.suggestedTaxReserve ?? 0);
  const collectedIncome = Number(summary?.collectedIncome ?? 0);
  const operatingExpenses = Number(summary?.operatingExpenses ?? 0);
  const taxReserve = Number(summary?.suggestedTaxReserve ?? 0);
  const businessProfit = collectedIncome - operatingExpenses;
  const plan = access.plan ? PLANS[access.plan as PlanId] : null;

  return <div className="workspace-dashboard mx-auto max-w-[1240px]">
    <div className="dashboard-heading"><div><p className="eyebrow">{plan?.name ?? "Business overview"}</p><h1 className="page-title">Know what is yours to keep.</h1><p className="page-intro">Your financial position, bookkeeping priorities, and commission pipeline—at a glance.</p></div><div className="dashboard-heading-actions">{onboarding?.completed_at ? <Link href={`/dashboard/workspaces/${workspaceId}/banking`} className="primary-link">Review transactions <span aria-hidden="true">→</span></Link> : <Link href={`/dashboard/workspaces/${workspaceId}/onboarding`} className="primary-link">Continue setup <span aria-hidden="true">→</span></Link>}<span className="dashboard-date">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date())}</span></div></div>

    {access.mode === "billing_only" ? <section className="surface-card mt-8 p-7 sm:p-9"><p className="eyebrow">Choose a plan</p><h2 className="section-title mt-2">Activate your financial workspace</h2><p className="section-copy mt-2 max-w-xl">Your setup is saved. Select a plan to enter records, connect accounts, and generate reports.</p><Link href="/dashboard/billing" className="primary-link mt-6 inline-flex">View plans</Link></section> : <>
      {access.mode === "read_only" && <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Billing needs attention. Your records remain visible, but changes are temporarily paused.</div>}
      <section className="financial-priority-grid mt-8">
        <article className="metric-card metric-card-primary"><div className="metric-label"><span className="metric-dot"/>Available now</div><p>Safe to spend</p><strong>{dollars(safeToSpend)}</strong><span>After expenses and suggested tax reserve</span></article>
        <article className="metric-card metric-card-commission"><div className="metric-label">Coming next</div><p>Expected net commission</p><strong>{dollars(summary?.pendingNetCommission)}</strong><span>Pending commission pipeline</span></article>
        <article className="metric-card"><div className="metric-label">Set aside</div><p>Suggested tax reserve</p><strong>{dollars(taxReserve)}</strong><span>Planning estimate—not tax advice</span></article>
      </section>
      <section className="performance-strip mt-5" aria-label="Year-to-date performance">
        <div><p>Income</p><strong>{dollars(collectedIncome)}</strong></div><div><p>Expenses</p><strong>{dollars(operatingExpenses)}</strong></div><div><p>Business profit</p><strong>{dollars(businessProfit)}</strong></div><div className="performance-margin"><p>Profit margin</p><strong>{collectedIncome > 0 ? `${Math.round((businessProfit / collectedIncome) * 100)}%` : "—"}</strong></div>
      </section>
      <section className="dashboard-lower-grid mt-5">
        <div className="surface-card bookkeeping-panel"><div className="panel-heading"><div><p className="eyebrow">Today’s bookkeeping</p><h2 className="section-title mt-1">Move every dollar toward clarity</h2></div><Link href={`/dashboard/workspaces/${workspaceId}/sync`} className="text-link">Open review queue <span aria-hidden="true">→</span></Link></div><div className="workflow-list"><Link href={`/dashboard/workspaces/${workspaceId}/banking`} className="workflow-row"><span className="workflow-number">01</span><span><strong>Connect the source</strong><small>Bring bank activity into one reliable feed.</small></span><b aria-hidden="true">→</b></Link><Link href={`/dashboard/workspaces/${workspaceId}/sync`} className="workflow-row"><span className="workflow-number">02</span><span><strong>Review and categorize</strong><small>Confirm business activity and resolve duplicates.</small></span><b aria-hidden="true">→</b></Link><div className="workflow-row workflow-row-muted"><span className="workflow-number">03</span><span><strong>Reconcile and report</strong><small>Turn reviewed records into confident decisions.</small></span><b aria-hidden="true">✓</b></div></div></div>
        <aside className="surface-card next-action-panel"><p className="eyebrow">Recommended next</p><div className="action-icon" aria-hidden="true">{onboarding?.setup_method === "import" ? "↥" : "$"}</div><h2 className="section-title">{onboarding?.setup_method === "import" ? "Import your records" : "Connect your bank"}</h2><p className="section-copy">Complete your source activity to make every number on this page more dependable.</p><Link href={onboarding?.setup_method === "import" ? `/dashboard/workspaces/${workspaceId}/sync` : `/dashboard/workspaces/${workspaceId}/banking`} className="secondary-link mt-5 inline-flex">Get started <span aria-hidden="true">→</span></Link></aside>
      </section>
    </>}
  </div>;
}
