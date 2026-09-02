import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateWorkspaceForm from "./create-workspace-form";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (!workspaces || workspaces.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Welcome, {user?.email}</h1>
        <p className="mt-2 text-sm text-zinc-500">Create your first workspace to get started.</p>
        <div className="mt-6">
          <CreateWorkspaceForm />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Your workspaces</h1>
      <ul className="mt-6 flex flex-col gap-3">
        {workspaces.map((w) => (
          <li key={w.id} className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium">{w.name}</p>
            <div className="mt-2 flex gap-4 text-sm">
              <Link href={`/dashboard/workspaces/${w.id}/sync`} className="font-medium text-emerald-800 underline underline-offset-4">
                Sync &amp; Migration
              </Link>
              <Link href="/dashboard/billing" className="text-zinc-600 underline">
                Billing
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
