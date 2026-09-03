import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Closewise
          </Link>
          <nav className="flex gap-4 text-sm text-zinc-600">
            <Link href="/dashboard">Overview</Link>
            <Link href="/dashboard/billing">Billing</Link>
            <Link href="/dashboard/privacy">Privacy</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          <span>{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-10">{children}</main>
      <footer className="flex flex-col gap-2 border-t border-zinc-200 px-6 py-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between"><span>Finance Studio · Evermont Realty Partners LLC</span><span className="flex gap-4"><Link href="/privacy">Privacy</Link><Link href="/security">Security</Link></span></footer>
    </div>
  );
}
