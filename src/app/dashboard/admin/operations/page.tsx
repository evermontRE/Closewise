import Link from "next/link";
import { redirect } from "next/navigation";
import { getReliabilityOverview } from "@/data/admin-operations";
import { requirePlatformStaff } from "@/lib/admin/access";

export default async function OperationsPage() {
  let staff;
  try { staff = await requirePlatformStaff(); } catch { redirect("/dashboard"); }
  const data = await getReliabilityOverview(staff.admin);
  const openAlerts = data.alerts.filter((alert) => alert.status === "open");

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/admin" className="text-sm text-emerald-800 underline underline-offset-4">← Customer support</Link>
      <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Evermont operations</p><h1 className="mt-1 text-2xl font-semibold">Production reliability</h1><p className="mt-2 text-sm text-zinc-500">Service health, maintenance, alerts, and verified backup evidence.</p></div>
      <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {data.health.map((item) => <div key={item.service} className="rounded-lg border border-zinc-200 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">{item.service.replaceAll("-", " ")}</p><p className={`mt-2 font-semibold capitalize ${statusColor(item.status)}`}>{item.status}</p><p className="mt-2 text-xs text-zinc-500">{item.summary}</p><p className="mt-2 text-xs text-zinc-400">{formatDate(item.checked_at)}</p></div>)}
        {data.health.length === 0 && <p className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No maintenance run has recorded service health yet.</p>}
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Open alerts (${openAlerts.length})`}>{openAlerts.length ? openAlerts.map((alert) => <Row key={alert.alert_key} title={`${alert.severity}: ${alert.service}`} detail={`${alert.summary} · seen ${alert.occurrence_count} time(s) · ${formatDate(alert.last_seen_at)}`} tone={alert.severity === "critical" ? "text-red-700" : "text-amber-700"} />) : <Empty text="No open operational alerts." />}</Panel>
        <Panel title="Maintenance history">{data.maintenance.length ? data.maintenance.map((run) => <Row key={run.id} title={run.status} detail={`${run.request_id} · ${formatDate(run.started_at)}${run.error_message ? ` · ${run.error_message}` : ""}`} tone={statusColor(run.status)} />) : <Empty text="No maintenance runs yet." />}</Panel>
        <Panel title="Backup verification">{data.backups.length ? data.backups.map((backup) => <Row key={backup.id} title={`${backup.verification_type.replaceAll("_", " ")} · ${backup.status}`} detail={`${backup.backup_reference} · ${formatDate(backup.verified_at)}`} tone={backup.status === "passed" ? "text-emerald-700" : "text-red-700"} />) : <Empty text="No Supabase backup or restore verification has been recorded." />}</Panel>
        <Panel title="Production endpoints"><Row title="Liveness" detail="GET /api/health/live" /><Row title="Readiness" detail="GET /api/health/ready · Bearer HEALTHCHECK_SECRET" /><Row title="Daily maintenance" detail="GET /api/internal/maintenance · Vercel Cron" /><Row title="Backup evidence" detail="POST /api/internal/backup-verification · Bearer OPERATIONS_SECRET" /></Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-zinc-200 p-5"><h2 className="font-semibold">{title}</h2><div className="mt-3 max-h-96 overflow-y-auto">{children}</div></section>; }
function Row({ title, detail, tone = "text-zinc-800" }: { title: string; detail: string; tone?: string }) { return <article className="border-t border-zinc-100 py-3 first:border-0"><p className={`text-sm font-medium capitalize ${tone}`}>{title}</p><p className="mt-1 break-all text-xs text-zinc-500">{detail}</p></article>; }
function Empty({ text }: { text: string }) { return <p className="py-4 text-sm text-zinc-500">{text}</p>; }
function statusColor(status: string) { return status === "healthy" || status === "succeeded" ? "text-emerald-700" : status === "failed" || status === "unhealthy" ? "text-red-700" : "text-amber-700"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)); }
