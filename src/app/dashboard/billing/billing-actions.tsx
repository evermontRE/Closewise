"use client";

import { useState } from "react";
import type { PlanId } from "@/lib/plans";

async function goTo(url: string) {
  window.location.href = url;
}

export function SubscribeButton({ workspaceId, plan }: { workspaceId: string; plan: PlanId }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, plan }),
        });
        const body = await res.json();
        if (body.url) await goTo(body.url);
        else setLoading(false);
      }}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {loading ? "Redirecting…" : "Subscribe"}
    </button>
  );
}

export function ManageBillingButton({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const res = await fetch("/api/stripe/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const body = await res.json();
        if (body.url) await goTo(body.url);
        else setLoading(false);
      }}
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      {loading ? "Redirecting…" : "Manage billing"}
    </button>
  );
}
