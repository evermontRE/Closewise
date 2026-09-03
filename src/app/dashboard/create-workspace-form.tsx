"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus("error");
      setMessage(body.error ?? "Something went wrong");
      return;
    }
    const body = await res.json();
    router.push(`/dashboard/workspaces/${body.workspace.id}/onboarding`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Workspace name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Smith Realty Group"
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:opacity-50"
      >
        {status === "loading" ? "Creating…" : "Create workspace"}
      </button>
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
    </form>
  );
}
