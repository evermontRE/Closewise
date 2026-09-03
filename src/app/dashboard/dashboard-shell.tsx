"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import SignOutButton from "./sign-out-button";

type Workspace = { id: string; name: string };

function NavLink({ href, label, onSelect }: { href: string; label: string; onSelect: () => void }) {
  const pathname = usePathname();
  const pathOnly = href.split("?")[0];
  const active = pathname === pathOnly || (pathOnly !== "/dashboard" && pathname.startsWith(`${pathOnly}/`));
  return <Link href={href} onClick={onSelect} className={`dashboard-nav-link ${active ? "dashboard-nav-link-active" : ""}`}>{label}</Link>;
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
            <span className="brand-mark">FS</span>
            <span><strong className="block text-sm tracking-tight">Finance Studio</strong><span className="text-[11px] text-emerald-100/70">by Evermont</span></span>
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
          <NavLink href="/dashboard" label="Workspaces" onSelect={close} />
          {workspace && <>
            <NavLink href={`/dashboard/workspaces/${workspace.id}`} label="Financial overview" onSelect={close} />
            <NavLink href={`/dashboard/workspaces/${workspace.id}/banking`} label="Connected banks" onSelect={close} />
            <NavLink href={`/dashboard/workspaces/${workspace.id}/sync`} label="Sync & import" onSelect={close} />
            <NavLink href={`/dashboard/workspaces/${workspace.id}/onboarding`} label="Workspace setup" onSelect={close} />
          </>}
          <div className="my-3 border-t border-white/10" />
          <NavLink href={workspace ? `/dashboard/billing?workspace=${workspace.id}` : "/dashboard/billing"} label="Plan & billing" onSelect={close} />
          <NavLink href="/dashboard/privacy" label="Privacy center" onSelect={close} />
          {platformNav}
        </nav>

        <div className="border-t border-white/10 pt-4 text-xs text-emerald-50/70">
          <p className="truncate">{email}</p>
          <div className="mt-3"><SignOutButton /></div>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Financial intelligence</p><p className="mt-0.5 text-sm text-zinc-600">{workspace?.name ?? "Your business workspace"}</p></div>
          <Link href={workspace ? `/dashboard/billing?workspace=${workspace.id}` : "/dashboard/billing"} className="rounded-full border border-emerald-800/20 bg-white px-4 py-2 text-xs font-semibold text-emerald-900 shadow-sm">View plan</Link>
        </header>
        <main className="dashboard-main">{children}</main>
        <footer className="dashboard-footer"><span>Finance Studio v1.0 © 2026 Evermont Realty Partners LLC.</span><span className="flex gap-4"><Link href="/privacy">Privacy</Link><Link href="/security">Security</Link></span></footer>
      </div>
    </div>
  );
}
