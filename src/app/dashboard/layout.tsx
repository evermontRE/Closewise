import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlatformStaffNav from "./platform-staff-nav";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: workspaces } = await supabase.from("workspaces").select("id,name").order("created_at", { ascending: true });

  return (
    <DashboardShell email={user.email ?? "Signed in"} workspaces={workspaces ?? []} platformNav={<PlatformStaffNav />}>
      {children}
    </DashboardShell>
  );
}
