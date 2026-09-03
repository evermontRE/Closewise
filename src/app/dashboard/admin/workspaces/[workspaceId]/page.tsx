import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOperationalWorkspace } from "@/data/admin-operations";
import { requirePlatformStaff } from "@/lib/admin/access";
import { AdminWorkspaceActions } from "../../admin-workspace-actions";

export default async function AdminWorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  let staff;
  try { staff = await requirePlatformStaff(); } catch { redirect("/dashboard"); }
  const { workspaceId } = await params;
  const workspace = await getOperationalWorkspace(staff.admin, workspaceId);
  if (!workspace) notFound();
  const activeReview = workspace.reviews.find((review) => !review.ended_at && new Date(review.expires_at) > new Date());
  const suspended = workspace.operations.status === "suspended";

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/admin" className="text-sm text-emerald-800 underline underline-offset-4">← Customer support</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{workspace.name}</h1><p className="mt-1 text-sm text-zinc-500">{workspace.ownerEmail} · {workspace.id}</p></div><span className={`rounded-full px-3 py-1 text-sm font-medium ${suspended ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>{workspace.operations.status}</span></div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Plan" value={`${workspace.subscription?.plan ?? "none"} · ${workspace.subscription?.status ?? "none"}`} />
        <Metric label="Bank connections" value={`${workspace.bankConnections.length}`} />
        <Metric label="Privacy requests" value={`${workspace.privacyRequests.length}`} />
        <Metric label="Stripe customer" value={workspace.stripeCustomerId ?? "Not created"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminWorkspaceActions workspaceId={workspace.id} platformRole={staff.role} suspended={suspended} activeReviewId={activeReview?.id ?? null} />
        <Panel title="Internal notes">{workspace.notes.length ? workspace.notes.map((note) => <article key={note.id} className="border-t border-zinc-100 py-3 first:border-0"><p className="text-sm">{note.note}</p><p className="mt-1 text-xs text-zinc-400">{formatDate(note.created_at)} · {note.reason}</p></article>) : <Empty />}</Panel>
        <Panel title="Operational audit history">{workspace.auditEvents.length ? workspace.auditEvents.map((event) => <article key={event.id} className="border-t border-zinc-100 py-3 first:border-0"><p className="text-sm font-medium capitalize">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-zinc-400">{formatDate(event.created_at)} · {event.reason}</p></article>) : <Empty />}</Panel>
        <Panel title="Billing history">{workspace.billingEvents.length ? workspace.billingEvents.map((event) => <article key={event.id} className="border-t border-zinc-100 py-3 first:border-0"><p className="text-sm">{event.event_type}</p><p className="mt-1 text-xs text-zinc-400">{formatDate(event.occurred_at)} · {event.plan ?? "no plan"} · {event.subscription_status}</p></article>) : <Empty />}</Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-zinc-200 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 break-all text-sm font-medium capitalize">{value}</p></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-zinc-200 p-5"><h2 className="font-semibold">{title}</h2><div className="mt-3 max-h-80 overflow-y-auto">{children}</div></section>; }
function Empty() { return <p className="py-4 text-sm text-zinc-500">No records yet.</p>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)); }
