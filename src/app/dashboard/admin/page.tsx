import Link from "next/link";
import { redirect } from "next/navigation";
import { searchOperationalWorkspaces } from "@/data/admin-operations";
import { requirePlatformStaff } from "@/lib/admin/access";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  let staff;
  try { staff = await requirePlatformStaff(); } catch { redirect("/dashboard"); }
  const { q = "" } = await searchParams;
  const workspaces = await searchOperationalWorkspaces(staff.admin, q);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Evermont operations</p><h1 className="mt-1 text-2xl font-semibold">Customer support</h1><p className="mt-2 text-sm text-zinc-500">Operational metadata only · signed in as {staff.role}</p></div>
        <form className="flex gap-2" action="/dashboard/admin"><label className="sr-only" htmlFor="admin-search">Search customers</label><input id="admin-search" name="q" defaultValue={q} className="w-72 rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Workspace, ID, or Stripe customer" /><button className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white">Search</button></form>
      </div>
      <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Operations</th><th className="px-4 py-3"><span className="sr-only">Open</span></th></tr></thead><tbody className="divide-y divide-zinc-200">{workspaces.map((workspace) => <tr key={workspace.id}><td className="px-4 py-3"><p className="font-medium">{workspace.name}</p><p className="font-mono text-xs text-zinc-400">{workspace.id}</p></td><td className="px-4 py-3">{workspace.ownerEmail}</td><td className="px-4 py-3 capitalize">{workspace.subscription?.plan ?? "No plan"} · {workspace.subscription?.status ?? "none"}</td><td className="px-4 py-3 capitalize"><span className={workspace.operationalStatus === "suspended" ? "font-medium text-red-700" : "text-emerald-700"}>{workspace.operationalStatus}</span></td><td className="px-4 py-3 text-right"><Link href={`/dashboard/admin/workspaces/${workspace.id}`} className="font-medium text-emerald-800 underline underline-offset-4">Review</Link></td></tr>)}</tbody></table>
        {workspaces.length === 0 && <p className="p-6 text-sm text-zinc-500">No workspaces match this search.</p>}
      </div>
    </div>
  );
}
