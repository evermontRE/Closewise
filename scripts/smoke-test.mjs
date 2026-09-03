import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const port = 3210;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "build-placeholder", NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_REGISTRATION_MODE: "beta" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { const response = await fetch(`${origin}/api/health/live`, { signal: AbortSignal.timeout(1_000) }); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Finance Studio did not become ready for smoke testing.\n${serverOutput}`);
}

try {
  await waitForServer();
  const routes = [["/", "Run your real estate business"], ["/pricing", "Plans for every stage"], ["/privacy", "Privacy Policy"], ["/security", "Financial organization requires"], ["/terms", "Terms of Use"], ["/sign-in", "Sign in"], ["/sign-up", "Private beta access"]];
  for (const [path, expected] of routes) {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200, `${path} should load`);
    const html = await response.text();
    assert.match(html, new RegExp(expected, "i"), `${path} should contain its primary content`);
    assert.ok(html.includes("<main") || html.includes("<h1"), `${path} should expose a primary landmark or heading`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${path} should retain security headers`);
    assert.ok(response.headers.get("content-security-policy"), `${path} should include CSP`);
  }
  const dashboard = await fetch(`${origin}/dashboard`, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  assert.ok([302, 307, 308].includes(dashboard.status), "anonymous dashboard access should redirect");
  console.log("Smoke test passed: public routes, legal pages, beta gate, security headers, and authentication redirect.");
} finally {
  server.kill("SIGTERM");
}
