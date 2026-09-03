import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateWorkspaceForm from "./create-workspace-form";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Welcome to Finance Studio</p>
        <h1 className="page-title">Build a clear financial home for your business.</h1>
        <p className="page-intro">Start with one workspace. Guided setup will help you choose a tax year, establish your baseline, and connect your records.</p>
        <div className="surface-card mt-8 p-6 sm:p-8">
          <CreateWorkspaceForm />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">Finance Studio</p>
      <h1 className="page-title">Your financial workspaces</h1>
      <p className="page-intro">Choose a business to review its position, records, and next bookkeeping action.</p>
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {workspaces.map((w) => (
          <li key={w.id} className="surface-card p-6">
            <span className="brand-mark brand-mark-light">FS</span>
            <p className="mt-5 text-lg font-semibold tracking-tight">{w.name}</p>
            <p className="mt-1 text-sm text-zinc-500">Financial records, planning, and reporting</p>
            <div className="mt-6 flex items-center gap-3 text-sm">
              <Link href={`/dashboard/workspaces/${w.id}`} className="primary-link">Open workspace</Link>
              <Link href={`/dashboard/workspaces/${w.id}/onboarding`} className="secondary-link">Setup</Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
