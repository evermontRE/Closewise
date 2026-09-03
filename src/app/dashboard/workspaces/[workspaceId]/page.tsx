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
  const plan = access.plan ? PLANS[access.plan as PlanId] : null;

  return <div className="mx-auto max-w-6xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{plan?.name ?? "Workspace overview"}</p><h1 className="page-title">{workspace.name}</h1><p className="page-intro">A focused view of what came in, what went out, and what needs attention.</p></div>{onboarding?.completed_at ? null : <Link href={`/dashboard/workspaces/${workspaceId}/onboarding`} className="primary-link self-start">Continue setup</Link>}</div>

    {access.mode === "billing_only" ? <section className="surface-card mt-8 p-7 sm:p-9"><p className="eyebrow">Choose a plan</p><h2 className="section-title mt-2">Activate your financial workspace</h2><p className="section-copy mt-2 max-w-xl">Your setup is saved. Select a plan to enter records, connect accounts, and generate reports.</p><Link href="/dashboard/billing" className="primary-link mt-6 inline-flex">View plans</Link></section> : <>
      {access.mode === "read_only" && <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Billing needs attention. Your records remain visible, but changes are temporarily paused.</div>}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="metric-card metric-card-primary"><p>Safe to spend</p><strong>{dollars(safeToSpend)}</strong><span>Opening cash plus activity, after reserve</span></article>
        <article className="metric-card"><p>Collected income</p><strong>{dollars(summary?.collectedIncome)}</strong><span>This tax year</span></article>
        <article className="metric-card"><p>Operating expenses</p><strong>{dollars(summary?.operatingExpenses)}</strong><span>This tax year</span></article>
        <article className="metric-card"><p>Pending commission</p><strong>{dollars(summary?.pendingNetCommission)}</strong><span>Expected net pipeline</span></article>
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="surface-card p-6"><div className="flex items-center justify-between"><div><p className="eyebrow">Bookkeeping flow</p><h2 className="section-title mt-1">Keep the records current</h2></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Link href={`/dashboard/workspaces/${workspaceId}/banking`} className="workflow-card"><span>01</span><strong>Connect</strong><p>Bring in bank activity securely.</p></Link><Link href={`/dashboard/workspaces/${workspaceId}/sync`} className="workflow-card"><span>02</span><strong>Review</strong><p>Resolve imports and duplicates.</p></Link><div className="workflow-card"><span>03</span><strong>Report</strong><p>Use reconciled records for decisions.</p></div></div></div>
        <aside className="surface-card p-6"><p className="eyebrow">Next action</p><h2 className="section-title mt-1">{onboarding?.setup_method === "import" ? "Import your records" : "Connect your bank"}</h2><p className="section-copy mt-2">A complete source of activity makes your overview and reports more reliable.</p><Link href={onboarding?.setup_method === "import" ? `/dashboard/workspaces/${workspaceId}/sync` : `/dashboard/workspaces/${workspaceId}/banking`} className="secondary-link mt-5 inline-flex">Get started</Link></aside>
      </section>
    </>}
  </div>;
}
