"use client";

import { useState, type ReactNode } from "react";

type IconName = "overview" | "bank" | "review" | "commission" | "expense" | "tax" | "report" | "setup";

const icons: Record<IconName, ReactNode> = {
  overview: <><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></>,
  bank: <><path d="m3 10 9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/></>,
  review: <><path d="M20 7h-5V2M4 17h5v5"/><path d="M5 9a8 8 0 0 1 14-2M19 15a8 8 0 0 1-14 2"/></>,
  commission: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  expense: <><path d="M4 7h16v13H4zM8 7V4h8v3M8 12h8"/></>,
  tax: <><path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"/></>,
  report: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  setup: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-2.8 2.8a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6h-4a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-2.8-2.8a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l2.8-2.8a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l2.8 2.8a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1v4a1.7 1.7 0 0 0-1.6 1Z"/></>,
};

function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

const nav: Array<{ label: string; icon: IconName; section?: string }> = [
  { label: "Overview", icon: "overview", section: "Workspace" },
  { label: "Banking", icon: "bank" },
  { label: "Review transactions", icon: "review" },
  { label: "Commissions", icon: "commission", section: "Money" },
  { label: "Expenses", icon: "expense" },
  { label: "Tax planning", icon: "tax" },
  { label: "Reports", icon: "report", section: "Insights" },
  { label: "Workspace setup", icon: "setup", section: "Account" },
];

export default function DesignPreview() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return <div className="dashboard-frame design-preview-frame">
    <button className="dashboard-menu-button" type="button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><span/><span/><span/></button>
    <button className={`dashboard-scrim ${open ? "dashboard-scrim-open" : ""}`} type="button" onClick={close} aria-label="Close navigation overlay"/>
    <aside className={`dashboard-sidebar ${open ? "dashboard-sidebar-open" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><span className="brand-mark"><span>F</span></span><span><strong className="block text-[15px] tracking-[-.025em]">Finance Studio</strong><span className="text-[10px] uppercase tracking-[.18em] text-emerald-100/55">Evermont</span></span></div>
        <button className="dashboard-close-button" type="button" onClick={close} aria-label="Close navigation">×</button>
      </div>
      <label className="mt-7 block text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/60">Workspace<select defaultValue="Eva Morais Realty" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none"><option>Eva Morais Realty</option></select></label>
      <nav className="mt-7 flex flex-1 flex-col gap-1" aria-label="Design preview navigation">
        {nav.map((item, index) => <div key={item.label}>{item.section ? <p className={`dashboard-nav-label ${index ? "mt-5" : ""}`}>{item.section}</p> : null}<button type="button" onClick={close} className={`dashboard-nav-link w-full text-left ${index === 0 ? "dashboard-nav-link-active" : ""}`}><span className="dashboard-nav-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{item.label === "Review transactions" ? <b className="nav-count">12</b> : null}</button></div>)}
      </nav>
      <div className="border-t border-white/10 pt-4"><p className="text-[11px] text-emerald-50/65">eva@evermontre.com</p><p className="mt-1 text-[10px] text-emerald-50/35">Design preview · fictional data</p></div>
    </aside>
    <div className="dashboard-body">
      <header className="dashboard-topbar"><div><p className="topbar-kicker">Financial command center</p><p className="topbar-workspace">Eva Morais Realty</p></div><div className="flex items-center gap-3"><span className="preview-status"><i/>Design preview</span><button type="button" className="topbar-plan">Essentials plan</button></div></header>
      <main className="dashboard-main">
        <div className="workspace-dashboard mx-auto max-w-[1240px]">
          <div className="design-preview-note"><span>Design mode</span><p>Select any area in the browser and leave a comment. All figures below are fictional.</p></div>
          <div className="dashboard-heading"><div><p className="eyebrow">Business overview</p><h1 className="page-title">Know what is yours to keep.</h1><p className="page-intro">Your financial position, bookkeeping priorities, and commission pipeline—at a glance.</p></div><div className="dashboard-heading-actions"><button type="button" className="primary-link">Review transactions <span aria-hidden="true">→</span></button><span className="dashboard-date">September 2026</span></div></div>
          <section className="financial-priority-grid mt-8">
            <article className="metric-card metric-card-primary"><div className="metric-label"><span className="metric-dot"/>Available now</div><p>Safe to spend</p><strong>$18,420.00</strong><span>After expenses and suggested tax reserve</span></article>
            <article className="metric-card metric-card-commission"><div className="metric-label">Coming next</div><p>Expected net commission</p><strong>$12,780.00</strong><span>3 pending closings</span></article>
            <article className="metric-card"><div className="metric-label">Set aside</div><p>Suggested tax reserve</p><strong>$8,250.00</strong><span>Planning estimate—not tax advice</span></article>
          </section>
          <section className="performance-strip mt-5" aria-label="Year-to-date performance"><div><p>Income</p><strong>$86,400.00</strong></div><div><p>Expenses</p><strong>$21,760.00</strong></div><div><p>Business profit</p><strong>$64,640.00</strong></div><div className="performance-margin"><p>Profit margin</p><strong>75%</strong></div></section>
          <section className="dashboard-lower-grid mt-5">
            <div className="surface-card bookkeeping-panel"><div className="panel-heading"><div><p className="eyebrow">Today’s bookkeeping</p><h2 className="section-title mt-1">Move every dollar toward clarity</h2></div><button type="button" className="text-link">Open review queue <span aria-hidden="true">→</span></button></div><div className="workflow-list"><button type="button" className="workflow-row w-full text-left"><span className="workflow-number">01</span><span><strong>Review 12 new transactions</strong><small>Confirm categories and business purpose.</small></span><b aria-hidden="true">→</b></button><button type="button" className="workflow-row w-full text-left"><span className="workflow-number">02</span><span><strong>Match 2 deposits to deals</strong><small>Connect commission income to the right closing.</small></span><b aria-hidden="true">→</b></button><button type="button" className="workflow-row w-full text-left"><span className="workflow-number">03</span><span><strong>Reconcile August</strong><small>Compare reviewed activity with your statement.</small></span><b aria-hidden="true">→</b></button></div></div>
            <aside className="surface-card next-action-panel"><p className="eyebrow">Recommended next</p><div className="action-icon" aria-hidden="true">12</div><h2 className="section-title">Clear your review queue</h2><p className="section-copy">Twelve bank transactions need a category or deal match before your reports are current.</p><button type="button" className="secondary-link mt-5 inline-flex">Start review <span aria-hidden="true">→</span></button></aside>
          </section>
        </div>
      </main>
      <footer className="dashboard-footer"><span>Finance Studio design preview · Fictional data only</span><span>Desktop · Tablet · Mobile</span></footer>
    </div>
  </div>;
}
