import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { name } = await request.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // The on_workspace_created trigger (see supabase/migrations/0001_init.sql)
  // adds the owner membership row and a blank subscriptions row.
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ name: name.trim(), owner_id: user.id })
    .select("id, name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workspace });
}
