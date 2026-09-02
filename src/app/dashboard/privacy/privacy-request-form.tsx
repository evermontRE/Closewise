"use client";
import { useState } from "react";

export default function PrivacyRequestForm({ workspaces }: { workspaces: Array<{ id: string; name: string }> }) {
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  async function submit(formData: FormData) {
    setWorking(true); setMessage("");
    try {
      const response = await fetch("/api/privacy/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: formData.get("type"), workspaceId: formData.get("workspaceId") || null, details: formData.get("details") }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setMessage("Request received. Refresh this page to see its status.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to submit the request."); }
    finally { setWorking(false); }
  }
  return <form action={submit} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><label className="block text-sm font-medium" htmlFor="privacy-type">Request type</label><select id="privacy-type" name="type" required className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"><option value="export">Export my information</option><option value="access">Access information about me</option><option value="correction">Correct my information</option><option value="restriction">Restrict processing</option><option value="deletion">Delete my information</option></select><label className="mt-5 block text-sm font-medium" htmlFor="privacy-workspace">Workspace</label><select id="privacy-workspace" name="workspaceId" className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"><option value="">Entire account</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><label className="mt-5 block text-sm font-medium" htmlFor="privacy-details">Details</label><textarea id="privacy-details" name="details" maxLength={2000} rows={5} className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Explain what you want us to review."/><button disabled={working} className="mt-5 rounded-full bg-[#143f34] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{working ? "Submitting..." : "Submit request"}</button>{message ? <p role="status" className="mt-4 text-sm text-zinc-600">{message}</p> : null}</form>;
}
