"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Onboarding = { current_step: number; business_type: string | null; tax_year: number | null; opening_balance_cents: number | null; setup_method: string | null; completed_at: string | null } | null;

export default function OnboardingFlow({ workspaceId, workspaceName, initial }: { workspaceId: string; workspaceName: string; initial: Onboarding }) {
  const router = useRouter();
  const [step, setStep] = useState(initial?.current_step ?? 1);
  const [businessType, setBusinessType] = useState(initial?.business_type ?? "solo_agent");
  const [taxYear, setTaxYear] = useState(String(initial?.tax_year ?? new Date().getFullYear()));
  const [openingBalance, setOpeningBalance] = useState(initial?.opening_balance_cents === null || initial?.opening_balance_cents === undefined ? "" : (initial.opening_balance_cents / 100).toFixed(2));
  const [setupMethod, setSetupMethod] = useState(initial?.setup_method ?? "bank");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(nextStep: number, completed = false) {
    setSaving(true); setError("");
    const cents = openingBalance === "" ? null : Math.round(Number(openingBalance) * 100);
    const response = await fetch(`/api/workspaces/${workspaceId}/onboarding`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentStep: nextStep, businessType, taxYear: Number(taxYear), openingBalanceCents: cents, setupMethod, completed }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error ?? "Unable to save your progress"); return; }
    if (completed) { router.push(`/dashboard/workspaces/${workspaceId}`); router.refresh(); return; }
    setStep(nextStep);
  }

  return <div className="mx-auto max-w-3xl">
    <p className="eyebrow">Workspace setup</p>
    <h1 className="page-title">Set up {workspaceName}</h1>
    <p className="page-intro">Four short steps establish the context Finance Studio needs. You can change these choices later.</p>
    <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Setup progress">
      {["Business", "Baseline", "Records", "Ready"].map((label, index) => <li key={label}><div className={`h-1 rounded-full ${step >= index + 1 ? "bg-emerald-700" : "bg-zinc-200"}`} /><span className={`mt-2 hidden text-xs sm:block ${step === index + 1 ? "font-semibold text-emerald-900" : "text-zinc-500"}`}>{label}</span></li>)}
    </ol>

    <section className="surface-card mt-7 p-6 sm:p-8">
      {step === 1 && <><h2 className="section-title">How is this business organized?</h2><p className="section-copy">This keeps the workspace language and workflow relevant.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{[["solo_agent","Solo agent"],["team","Real estate team"],["brokerage","Brokerage"],["other","Other business"]].map(([value,label]) => <label key={value} className={`choice-card ${businessType === value ? "choice-card-selected" : ""}`}><input type="radio" name="businessType" value={value} checked={businessType === value} onChange={() => setBusinessType(value)} /><span>{label}</span></label>)}</div></>}
      {step === 2 && <><h2 className="section-title">Set your financial baseline</h2><p className="section-copy">Choose the reporting year and your current available business cash.</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="field-label">Tax year<input className="field-input" type="number" min="2000" max="2200" value={taxYear} onChange={(event) => setTaxYear(event.target.value)} required /></label><label className="field-label">Opening business cash<input className="field-input" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0.00" /></label></div></>}
      {step === 3 && <><h2 className="section-title">How will you bring in records?</h2><p className="section-copy">Choose a starting path. Nothing is imported until you confirm it.</p><div className="mt-6 grid gap-3">{[["bank","Connect a bank securely"],["import","Import an existing Finance Studio backup"],["manual","Enter my first records manually"],["later","Decide later"]].map(([value,label]) => <label key={value} className={`choice-card ${setupMethod === value ? "choice-card-selected" : ""}`}><input type="radio" name="setupMethod" value={value} checked={setupMethod === value} onChange={() => setSetupMethod(value)} /><span>{label}</span></label>)}</div></>}
      {step === 4 && <div className="py-3 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</span><h2 className="section-title mt-5">Your workspace is ready.</h2><p className="section-copy mx-auto mt-2 max-w-lg">Start with the financial overview. Finance Studio will guide you to the next useful action as records arrive.</p></div>}
      {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-5">
        {step > 1 && step < 4 ? <button className="secondary-button" type="button" onClick={() => setStep(step - 1)}>Back</button> : <Link href={`/dashboard/workspaces/${workspaceId}`} className="secondary-link">Finish later</Link>}
        <button className="primary-button" type="button" disabled={saving} onClick={() => save(step === 4 ? 4 : step + 1, step === 4)}>{saving ? "Saving…" : step === 4 ? "Open Finance Studio" : "Continue"}</button>
      </div>
    </section>
  </div>;
}
