"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import SignOutButton from "./sign-out-button";

type Workspace = { id: string; name: string };

type IconName = "grid" | "overview" | "bank" | "sync" | "setup" | "billing" | "privacy";

const iconPaths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  overview: <><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></>,
  bank: <><path d="m3 10 9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/></>,
  sync: <><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M5.1 9A8 8 0 0 1 19 7M18.9 15A8 8 0 0 1 5 17"/></>,
  setup: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.08a1.7 1.7 0 0 0 1.06 1.52 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.8 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.62.78 1.03 1.43 1.03H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
  billing: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>,
  privacy: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
};

function NavIcon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function NavLink({ href, label, icon, onSelect }: { href: string; label: string; icon: IconName; onSelect: () => void }) {
  const pathname = usePathname();
  const pathOnly = href.split("?")[0];
  const active = pathname === pathOnly || (pathOnly !== "/dashboard" && pathname.startsWith(`${pathOnly}/`));
  return <Link href={href} onClick={onSelect} className={`dashboard-nav-link ${active ? "dashboard-nav-link-active" : ""}`}><span className="dashboard-nav-icon"><NavIcon name={icon}/></span><span>{label}</span></Link>;
}

export default function DashboardShell({ children, email, workspaces, platformNav }: { children: ReactNode; email: string; workspaces: Workspace[]; platformNav: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const workspaceId = pathname.match(/^\/dashboard\/workspaces\/([^/]+)/)?.[1] ?? workspaces[0]?.id;
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];
  const close = () => setOpen(false);
  return (
    <div className="dashboard-frame">
      <button className="dashboard-menu-button" type="button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
        <span /><span /><span />
      </button>
      <div className={`dashboard-scrim ${open ? "dashboard-scrim-open" : ""}`} onClick={close} aria-hidden="true" />
      <aside className={`dashboard-sidebar ${open ? "dashboard-sidebar-open" : ""}`}>
        <div className="flex items-center justify-between">
          <Link href="/dashboard" onClick={close} className="flex items-center gap-3">
            <span className="brand-mark"><span>F</span></span>
            <span><strong className="block text-[15px] tracking-[-.025em]">Finance Studio</strong><span className="text-[10px] uppercase tracking-[.18em] text-emerald-100/55">Evermont</span></span>
          </Link>
          <button className="dashboard-close-button" type="button" onClick={close} aria-label="Close navigation">×</button>
        </div>

        {workspaces.length > 0 && <label className="mt-7 block text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/60">
          Workspace
          <select value={workspace?.id} onChange={(event) => router.push(`/dashboard/workspaces/${event.target.value}`)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none">
            {workspaces.map((item) => <option key={item.id} value={item.id} className="text-zinc-900">{item.name}</option>)}
          </select>
        </label>}

        <nav className="mt-7 flex flex-1 flex-col gap-1" aria-label="Main navigation">
          <p className="dashboard-nav-label">Workspace</p>
          <NavLink href="/dashboard" label="All workspaces" icon="grid" onSelect={close} />
          {workspace && <>
            <NavLink href={`/dashboard/workspaces/${workspace.id}`} label="Overview" icon="overview" onSelect={close} />
            <NavLink href={`/dashboard/workspaces/${workspace.id}/banking`} label="Banking" icon="bank" onSelect={close} />
            <NavLink href={`/dashboard/workspaces/${workspace.id}/sync`} label="Review & import" icon="sync" onSelect={close} />
            <NavLink href={`/dashboard/workspaces/${workspace.id}/onboarding`} label="Workspace setup" icon="setup" onSelect={close} />
          </>}
          <div className="my-3 border-t border-white/10" />
          <p className="dashboard-nav-label">Account</p>
          <NavLink href={workspace ? `/dashboard/billing?workspace=${workspace.id}` : "/dashboard/billing"} label="Plan & billing" icon="billing" onSelect={close} />
          <NavLink href="/dashboard/privacy" label="Privacy & data" icon="privacy" onSelect={close} />
          {platformNav}
        </nav>

        <div className="border-t border-white/10 pt-4 text-xs text-emerald-50/70">
          <p className="truncate">{email}</p>
          <div className="mt-3"><SignOutButton /></div>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <div><p className="topbar-kicker">Financial command center</p><p className="topbar-workspace">{workspace?.name ?? "Your business workspace"}</p></div>
          <div className="flex items-center gap-3"><span className="preview-status"><i/>Preview</span><Link href={workspace ? `/dashboard/billing?workspace=${workspace.id}` : "/dashboard/billing"} className="topbar-plan">View plan</Link></div>
        </header>
        <main className="dashboard-main">{children}</main>
        <footer className="dashboard-footer"><span>Finance Studio v1.0 © 2026 Evermont Realty Partners LLC.</span><span className="flex gap-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/security">Security</Link></span></footer>
      </div>
    </div>
  );
}
