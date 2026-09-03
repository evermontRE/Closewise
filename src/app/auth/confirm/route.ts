import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function safeNextPath(value: string | null, type: EmailOtpType) {
  if (value?.startsWith("/") && !value.startsWith("//")) return value;
  return type === "invite" || type === "recovery" ? "/set-password" : "/dashboard";
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");

  if (!tokenHash || !rawType || !allowedTypes.has(rawType as EmailOtpType)) {
    return NextResponse.redirect(`${origin}/sign-in?error=invalid_link`);
  }

  const type = rawType as EmailOtpType;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=expired_link`);
  }

  return NextResponse.redirect(`${origin}${safeNextPath(searchParams.get("next"), type)}`);
}
