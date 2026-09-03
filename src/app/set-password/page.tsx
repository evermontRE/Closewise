"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        router.replace("/sign-in?error=invite_required");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 12) {
      setStatus("error");
      setMessage("Use at least 12 characters.");
      return;
    }
    if (password !== confirmation) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  if (checking) {
    return <div className="flex flex-1 items-center justify-center px-6 py-24 text-sm text-zinc-500">Checking your invitation…</div>;
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Create your password</h1>
        <p className="mt-2 text-sm text-zinc-500">Finish activating your Finance Studio account.</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Confirm password
            <input type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
          </label>
          <button type="submit" disabled={status === "loading"} className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {status === "loading" ? "Saving…" : "Create password"}
          </button>
          {status === "error" && <p role="alert" className="text-sm text-red-600">{message}</p>}
        </form>

        <p className="mt-6 text-sm text-zinc-500">Already activated? <Link href="/sign-in" className="font-medium text-zinc-900 underline">Sign in</Link></p>
      </div>
    </div>
  );
}
