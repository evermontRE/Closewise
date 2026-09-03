"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "add_note" | "suspend" | "reactivate" | "start_review" | "end_review";

export function AdminWorkspaceActions({ workspaceId, platformRole, suspended, activeReviewId }: { workspaceId: string; platformRole: string; suspended: boolean; activeReviewId: string | null }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState("");

  async function act(action: Action) {
    setPending(action);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ action, reason, note: action === "add_note" ? note : null, sessionId: action === "end_review" ? activeReviewId : null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Operation failed.");
      setReason("");
      if (action === "add_note") setNote("");
      setMessage("Operation completed and recorded in the audit history.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setPending(null);
    }
  }

  const disabled = pending !== null || reason.trim().length < 10;
  return (
    <section className="rounded-lg border border-zinc-200 p-5">
      <h2 className="font-semibold">Support actions</h2>
      <p className="mt-1 text-sm text-zinc-500">Every action requires a reason and creates an immutable audit event.</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="support-reason">Reason</label>
      <textarea id="support-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-md border border-zinc-300 p-2 text-sm" placeholder="Why is this operational action necessary?" />
      <label className="mt-3 block text-sm font-medium" htmlFor="support-note">Internal note</label>
      <textarea id="support-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-md border border-zinc-300 p-2 text-sm" placeholder="Only required when adding a note." />
      <div className="mt-4 flex flex-wrap gap-2">
        {platformRole !== "auditor" && <button type="button" disabled={disabled || note.trim().length < 2} onClick={() => act("add_note")} className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Add internal note</button>}
        {platformRole !== "auditor" && !activeReviewId && <button type="button" disabled={disabled} onClick={() => act("start_review")} className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Start 30-minute review</button>}
        {platformRole !== "auditor" && activeReviewId && <button type="button" disabled={disabled} onClick={() => act("end_review")} className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-40">End review</button>}
        {platformRole === "admin" && <button type="button" disabled={disabled} onClick={() => act(suspended ? "reactivate" : "suspend")} className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-40">{suspended ? "Reactivate workspace" : "Suspend workspace"}</button>}
      </div>
      {message && <p role="status" className="mt-3 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}
