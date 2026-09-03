import assert from "node:assert/strict";

const deploymentUrl = process.env.DEPLOYMENT_URL;
assert.ok(deploymentUrl, "DEPLOYMENT_URL is required");
const origin = new URL(deploymentUrl).origin;
const headers = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};

async function request(path, options = {}) {
  return fetch(`${origin}${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15_000) });
}

const live = await request("/api/health/live");
assert.equal(live.status, 200, "Liveness endpoint must succeed");
const release = await live.json();
assert.equal(release.service, "finance-studio");
assert.ok(release.commit, "Deployment must expose a release commit");

for (const [path, text] of [["/terms", "Terms of Use"], ["/privacy", "Privacy Policy"], ["/security", "Financial organization requires"]]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} must load`);
  assert.match(await response.text(), new RegExp(text, "i"));
}

const dashboard = await request("/dashboard", { redirect: "manual" });
assert.ok([302, 307, 308].includes(dashboard.status), "Anonymous financial workspace access must redirect");

if (process.env.HEALTHCHECK_SECRET) {
  const ready = await request("/api/health/ready", { headers: { Authorization: `Bearer ${process.env.HEALTHCHECK_SECRET}` } });
  const report = await ready.json();
  assert.equal(ready.status, 200, `Readiness failed: ${JSON.stringify(report)}`);
  assert.equal(report.productionConfiguration, "valid");
  assert.equal(report.database, "reachable");
}

console.log(JSON.stringify({ status: "verified", deployment: origin, stage: release.stage, commit: release.commit, readinessChecked: Boolean(process.env.HEALTHCHECK_SECRET) }, null, 2));
