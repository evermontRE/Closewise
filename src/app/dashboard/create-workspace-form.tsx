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
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Workspace name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Smith Realty Group"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {status === "loading" ? "Creating…" : "Create workspace"}
      </button>
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
    </form>
  );
}
