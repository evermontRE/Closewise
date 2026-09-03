"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { registrationCopy, registrationMode } from "@/lib/registration";

export default function SignUpPage() {
  const copy = registrationCopy(registrationMode());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Check your email to confirm your account.");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Finance Studio</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{copy.heading}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{copy.description}</p>

        {copy.canRegister ? <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "loading" ? "Creating account…" : "Sign up"}
          </button>
          {message && (
            <p className={`text-sm ${status === "error" ? "text-red-600" : "text-emerald-600"}`}>{message}</p>
          )}
        </form> : <div className="mt-8 rounded-2xl border border-emerald-900/10 bg-emerald-50 p-5"><p className="text-sm leading-6 text-emerald-950">Invited testers receive an account invitation by email. To request consideration for the beta, contact Evermont and include your role and brokerage.</p><a href="mailto:eva@evermontre.com?subject=Finance%20Studio%20private%20beta" className="mt-4 inline-flex rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">Request beta access</a></div>}

        <p className="mt-6 text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-zinc-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
