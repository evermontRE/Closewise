import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isTrustedMutation } from "@/lib/security/request";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && !isTrustedMutation(request)) {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
