"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type");

    if (!accessToken || !refreshToken || (type !== "invite" && type !== "recovery")) {
      return;
    }

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const supabase = createClient();
    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        router.replace(error ? "/sign-in?error=expired_link" : "/set-password");
        router.refresh();
      });
  }, [router]);

  return null;
}
