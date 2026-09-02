"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectionLabels, mutationTitle, readLegacyFile, shortDeviceId, totalRecords } from "@/features/sync-center/model";
import { deviceId } from "@/lib/offline/indexed-db";
import { discardMutation, getQueuedMutations, resolveConflict, retryMutation, startAutomaticSync, subscribeSync, synchronize } from "@/lib/offline/sync-engine";
import type { OfflineMutation, SyncSnapshot } from "@/lib/offline/types";

type Preview = {
  id: string;
  status: string;
  counts: Record<string, { source: number; ready: number; duplicates: number; malformed: number }>;
  controlTotals: { sourceMoney: string; readyMoney: string; duplicateMoney: string };
  warnings: string[];
  report: string[];
};
type ImportResult = { status?: string; imported?: number; duplicates?: number; failed?: number; report?: string[] };
type Tab = "sync" | "migration" | "conflicts";
const initialSnapshot: SyncSnapshot = { online: true, phase: "idle", pending: 0, retrying: 0, conflicts: 0, failed: 0, lastSyncedAt: null, message: "Checking sync status..." };

export default function SyncCenter({ workspaceId, workspaceName, canImport }: { workspaceId: string; workspaceName: string; canImport: boolean }) {
  const [tab, setTab] = useState<Tab>("sync");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [queue, setQueue] = useState<OfflineMutation[]>([]);
  const [currentDevice, setCurrentDevice] = useState("");
  const [working, setWorking] = useState(false);
  const refreshQueue = useCallback(async () => setQueue(await getQueuedMutations(workspaceId)), [workspaceId]);

  useEffect(() => {
    const stop = startAutomaticSync();
    const unsubscribe = subscribeSync((next) => { setSnapshot(next); void refreshQueue(); });
    void deviceId().then(setCurrentDevice);
    return () => { stop(); unsubscribe(); };
  }, [refreshQueue]);

  const act = async (action: () => Promise<unknown>) => {
    setWorking(true);
    try { await action(); await refreshQueue(); } finally { setWorking(false); }
  };
  const conflicts = queue.filter((item) => item.status === "conflict");
  const waiting = queue.filter((item) => item.status !== "conflict");

  return (
    <div className="mx-auto w-full max-w-[1180px] pb-16">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Workspace continuity</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-zinc-950 md:text-4xl">Sync &amp; Migration Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Keep {workspaceName} available across connection changes and move your Finance Studio records with a reviewed, reversible workflow.</p>
        </div>
        <StatusPill snapshot={snapshot} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Waiting" value={snapshot.pending} tone="neutral" />
        <Metric label="Retrying" value={snapshot.retrying} tone="amber" />
        <Metric label="Conflicts" value={snapshot.conflicts} tone="red" />
        <Metric label="Last synchronized" value={snapshot.lastSyncedAt ? formatTime(snapshot.lastSyncedAt) : "Not yet"} tone="green" compact />
      </div>

      <div className="mb-6 flex w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-100 p-1.5 md:w-fit" role="tablist" aria-label="Sync center sections">
        <TabButton active={tab === "sync"} onClick={() => setTab("sync")}>Sync activity</TabButton>
        <TabButton active={tab === "migration"} onClick={() => setTab("migration")}>Import backup</TabButton>
        <TabButton active={tab === "conflicts"} onClick={() => setTab("conflicts")} badge={conflicts.length}>Resolve conflicts</TabButton>
      </div>

      {tab === "sync" && (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
          <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_18px_60px_rgba(20,56,45,0.06)]">
            <div className="flex flex-col gap-4 border-b border-zinc-200 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-semibold text-zinc-950">Saved changes</h2><p className="mt-1 text-sm text-zinc-500">Changes are kept on this device until they reach Finance Studio Cloud.</p></div>
              <button className="rounded-full bg-[#143f34] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d5a49] disabled:cursor-not-allowed disabled:opacity-50" disabled={working || !snapshot.online} onClick={() => void act(synchronize)}>{snapshot.phase === "syncing" ? "Synchronizing..." : "Synchronize now"}</button>
            </div>
            {waiting.length ? <ul className="divide-y divide-zinc-100">{waiting.map((item) => <QueueRow key={item.id} item={item} disabled={working} onRetry={() => void act(() => retryMutation(item.id))} onDiscard={() => { if (window.confirm("Discard this unsynchronized change? This cannot be undone.")) void act(() => discardMutation(item.id)); }} />)}</ul> : <EmptyState title="Everything is synchronized" body="New changes made without a connection will appear here automatically." />}
          </section>
          <aside className="space-y-6">
            <section className="rounded-3xl bg-[#143f34] p-6 text-white shadow-[0_18px_60px_rgba(20,63,52,0.2)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8fd3b4]/15 text-xl">⌁</div>
              <h2 className="mt-5 text-lg font-semibold">This device</h2>
              <p className="mt-1 text-sm text-emerald-50/70">Identifies changes created from this browser without exposing personal device details.</p>
              <dl className="mt-6 space-y-4 border-t border-white/10 pt-5 text-sm"><InfoRow label="Device code" value={currentDevice ? shortDeviceId(currentDevice) : "Loading..."} /><InfoRow label="Connection" value={snapshot.online ? "Online" : "Offline"} /><InfoRow label="Local protection" value="IndexedDB cache" /></dl>
            </section>
            <section className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6"><h3 className="font-semibold text-emerald-950">Safe offline behavior</h3><p className="mt-2 text-sm leading-6 text-emerald-900/70">Keep working if your connection drops. Finance Studio preserves each change in order and retries automatically when the connection returns.</p></section>
          </aside>
        </div>
      )}
      {tab === "migration" && <MigrationWizard workspaceId={workspaceId} canImport={canImport} />}
      {tab === "conflicts" && <ConflictCenter conflicts={conflicts} disabled={working} onResolve={(id, choice) => void act(() => resolveConflict(id, choice))} />}
    </div>
  );
}

function MigrationWizard({ workspaceId, canImport }: { workspaceId: string; canImport: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const step = result ? 3 : preview ? 2 : 1;
  const selectFile = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError(""); setPreview(null); setResult(null); setFileName(file.name);
    try {
      const backup = readLegacyFile(await file.text(), file.size);
      const response = await fetch(`/api/workspaces/${workspaceId}/imports/legacy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(backup) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Finance Studio could not review this backup.");
      setPreview(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Finance Studio could not read this backup."); }
    finally { setLoading(false); }
  };
  const commit = async () => {
    if (!preview) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/imports/legacy/${preview.id}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Finance Studio could not finish the import.");
      setResult(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Finance Studio could not finish the import."); }
    finally { setLoading(false); }
  };
  if (!canImport) return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8"><h2 className="text-lg font-semibold text-amber-950">Administrator access required</h2><p className="mt-2 text-sm text-amber-900/70">Only workspace owners and administrators can import a Finance Studio backup.</p></section>;
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_18px_60px_rgba(20,56,45,0.06)]">
      <div className="border-b border-zinc-200 px-6 py-5"><div className="flex items-center gap-2">{[1,2,3].map((n) => <div key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${n <= step ? "bg-[#2e826a]" : "bg-zinc-200"}`} />)}</div><p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Step {step} of 3 · {step === 1 ? "Choose backup" : step === 2 ? "Review before importing" : "Migration complete"}</p></div>
      {step === 1 && <div className="p-6 md:p-10"><button className="group flex min-h-64 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60" disabled={loading} onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void selectFile(e.dataTransfer.files[0]); }}><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">↑</span><strong className="mt-5 text-lg text-zinc-950">{loading ? "Reviewing your backup..." : "Choose your Finance Studio backup"}</strong><span className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">Select or drop the full JSON backup exported from the lifetime desktop or HTML edition. Nothing is written until you approve the preview.</span><span className="mt-4 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">JSON · Up to 25 MB</span></button><input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(e) => void selectFile(e.target.files?.[0])} />{fileName && <p className="mt-4 text-center text-sm text-zinc-500">Selected: {fileName}</p>}{error && <ErrorBox message={error} />}</div>}
      {step === 2 && preview && <div className="p-6 md:p-8"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Preview ready</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Review {totalRecords(preview.counts).toLocaleString()} records</h2><p className="mt-2 text-sm text-zinc-500">Duplicates remain untouched. Control totals let you confirm the money before importing.</p></div><button className="text-sm font-semibold text-zinc-500 underline underline-offset-4" onClick={() => { setPreview(null); setFileName(""); }}>Choose another file</button></div><div className="mt-7 grid gap-3 sm:grid-cols-3"><TotalCard label="Backup total" value={money(preview.controlTotals.sourceMoney)} /><TotalCard label="Ready to import" value={money(preview.controlTotals.readyMoney)} accent /><TotalCard label="Already imported" value={money(preview.controlTotals.duplicateMoney)} /></div><div className="mt-7 overflow-hidden rounded-2xl border border-zinc-200"><div className="grid grid-cols-[1fr_70px_70px] gap-3 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 sm:grid-cols-[1fr_110px_110px]"><span>Record type</span><span className="text-right">Ready</span><span className="text-right">Skipped</span></div>{Object.entries(preview.counts).filter(([,x]) => x.source > 0).map(([name,x]) => <div key={name} className="grid grid-cols-[1fr_70px_70px] gap-3 border-t border-zinc-100 px-4 py-3 text-sm sm:grid-cols-[1fr_110px_110px]"><span className="font-medium text-zinc-800">{collectionLabels[name] ?? name}</span><span className="text-right tabular-nums text-zinc-700">{x.ready}</span><span className="text-right tabular-nums text-zinc-500">{x.duplicates + x.malformed}</span></div>)}</div>{preview.warnings.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{preview.warnings.map((line) => <p key={line}>{line}</p>)}</div>}{error && <ErrorBox message={error} />}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold" onClick={() => setPreview(null)}>Cancel</button><button className="rounded-full bg-[#143f34] px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50" disabled={loading} onClick={() => void commit()}>{loading ? "Importing safely..." : "Import reviewed records"}</button></div></div>}
      {step === 3 && result && <div className="p-8 text-center md:p-12"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Migration complete</p><h2 className="mt-2 text-2xl font-semibold">Your Finance Studio records are ready</h2><div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-zinc-50 p-5 text-left text-sm leading-6 text-zinc-700">{(result.report ?? ["The reviewed records were imported successfully."]).map((line) => <p key={line}>{line}</p>)}</div><button className="mt-7 rounded-full bg-[#143f34] px-6 py-2.5 text-sm font-semibold text-white" onClick={() => { setResult(null); setPreview(null); setFileName(""); }}>Import another backup</button></div>}
    </section>
  );
}

function ConflictCenter({ conflicts, disabled, onResolve }: { conflicts: OfflineMutation[]; disabled: boolean; onResolve: (id: string, choice: "keep-server" | "retry-local") => void }) {
  if (!conflicts.length) return <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm"><EmptyState title="No conflicts need attention" body="If the same record changes on two devices, Finance Studio will pause it here and let you choose safely." /></section>;
  return <div className="space-y-5">{conflicts.map((item) => <section key={item.id} className="overflow-hidden rounded-3xl border border-red-200 bg-white shadow-sm"><div className="border-b border-red-100 bg-red-50 px-6 py-4"><p className="text-xs font-bold uppercase tracking-[0.15em] text-red-700">Needs your decision</p><h2 className="mt-1 text-lg font-semibold text-zinc-950">{mutationTitle(item)}</h2><p className="mt-1 text-sm text-red-900/70">{item.conflict?.message}</p></div><div className="grid md:grid-cols-2"><VersionCard label="Saved in the cloud" value={item.conflict?.serverRecord} /><VersionCard label="Change from this device" value={item.conflict?.localBody} local /></div><div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 p-5 sm:flex-row sm:justify-end"><button disabled={disabled} className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50" onClick={() => onResolve(item.id, "keep-server")}>Keep cloud version</button><button disabled={disabled} className="rounded-full bg-[#143f34] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => onResolve(item.id, "retry-local")}>Use my change</button></div></section>)}</div>;
}

function StatusPill({ snapshot }: { snapshot: SyncSnapshot }) { const tone = !snapshot.online ? "border-amber-200 bg-amber-50 text-amber-800" : snapshot.conflicts ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"; return <div className={`flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold ${tone}`}><span className={`h-2 w-2 rounded-full ${!snapshot.online ? "bg-amber-500" : snapshot.conflicts ? "bg-red-500" : "bg-emerald-500"}`} />{snapshot.message}</div>; }
function Metric({ label, value, tone, compact = false }: { label: string; value: number | string; tone: "neutral" | "amber" | "red" | "green"; compact?: boolean }) { const colors = { neutral: "bg-zinc-50 text-zinc-950", amber: "bg-amber-50 text-amber-950", red: "bg-red-50 text-red-950", green: "bg-emerald-50 text-emerald-950" }; return <div className={`rounded-2xl border border-black/5 p-4 ${colors[tone]}`}><p className="text-xs font-medium opacity-60">{label}</p><p className={`mt-1 font-semibold tabular-nums ${compact ? "text-sm" : "text-2xl"}`}>{value}</p></div>; }
function TabButton({ active, badge, children, onClick }: { active: boolean; badge?: number; children: React.ReactNode; onClick: () => void }) { return <button role="tab" aria-selected={active} onClick={onClick} className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition md:flex-none ${active ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}>{children}{badge ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{badge}</span> : null}</button>; }
function QueueRow({ item, disabled, onRetry, onDiscard }: { item: OfflineMutation; disabled: boolean; onRetry: () => void; onDiscard: () => void }) { const retry = item.status === "retrying" || item.status === "failed"; return <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${item.status === "failed" ? "bg-red-500" : retry ? "bg-amber-500" : "bg-zinc-400"}`} /><p className="truncate text-sm font-semibold text-zinc-900">{mutationTitle(item)}</p></div><p className="mt-1 pl-4 text-xs text-zinc-500">{retry ? item.lastError ?? "Waiting to retry" : `Saved ${formatTime(item.createdAt)}`}</p></div><div className="flex gap-2 pl-4 sm:pl-0">{retry && <button disabled={disabled} className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold" onClick={onRetry}>Retry now</button>}<button disabled={disabled} className="px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-red-700" onClick={onDiscard}>Discard</button></div></li>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-700">✓</div><h3 className="mt-4 font-semibold text-zinc-950">{title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{body}</p></div>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><dt className="text-emerald-50/60">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>; }
function TotalCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-zinc-950">{value}</p></div>; }
function ErrorBox({ message }: { message: string }) { return <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>; }
function VersionCard({ label, value, local = false }: { label: string; value: unknown; local?: boolean }) { return <div className={`min-w-0 p-6 ${local ? "border-t border-zinc-200 md:border-l md:border-t-0" : ""}`}><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p><pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-700">{JSON.stringify(value ?? {}, null, 2)}</pre></div>; }
function money(value: string) { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "$0.00"; }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
