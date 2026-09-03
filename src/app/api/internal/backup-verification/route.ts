import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBearerSecret } from "@/lib/operations/internal-auth";

export async function POST(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), process.env.OPERATIONS_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const reference = typeof body.backupReference === "string" ? body.backupReference.trim() : "";
    const type = body.verificationType;
    const status = body.status;
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null;
    const backupCreatedAt = typeof body.backupCreatedAt === "string" && !Number.isNaN(Date.parse(body.backupCreatedAt)) ? new Date(body.backupCreatedAt).toISOString() : null;
    if (reference.length < 4 || reference.length > 200 || (type !== "backup_visible" && type !== "restore_test") || (status !== "passed" && status !== "failed")) {
      return NextResponse.json({ error: "A backup reference, verification type, and status are required." }, { status: 400 });
    }
    const { data, error } = await createAdminClient().from("backup_verifications").upsert({
      provider: "supabase", backup_reference: reference, verification_type: type, status,
      backup_created_at: backupCreatedAt,
      notes,
    }, { onConflict: "provider,backup_reference,verification_type" }).select("id,status,verified_at").single();
    if (error) throw error;
    return NextResponse.json({ verification: data }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    return NextResponse.json({ error: "Unable to record backup verification." }, { status: 500 });
  }
}
