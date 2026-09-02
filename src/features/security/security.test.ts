import assert from "node:assert/strict";
import test from "node:test";
import { contentSecurityPolicy, securityHeaders } from "../../lib/security/headers.ts";
import { isTrustedMutation } from "../../lib/security/request.ts";

test("security headers prevent framing, sniffing, and unnecessary browser capabilities", () => {
  const headers = new Map(securityHeaders(true).map(({ key, value }) => [key, value]));
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(headers.get("Strict-Transport-Security") ?? "", /includeSubDomains/);
  assert.match(contentSecurityPolicy(true), /object-src 'none'/);
  assert.match(contentSecurityPolicy(true), /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicy(true), /cdn\.plaid\.com/);
});

test("cross-site mutations are rejected while signed webhook paths remain reachable", () => {
  assert.equal(isTrustedMutation(new Request("https://app.example/api/workspaces/1", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } })), false);
  assert.equal(isTrustedMutation(new Request("https://app.example/api/workspaces/1", { method: "POST", headers: { origin: "https://app.example", "sec-fetch-site": "same-origin" } })), true);
  assert.equal(isTrustedMutation(new Request("https://app.example/api/bank-connections/plaid/webhook", { method: "POST", headers: { origin: "https://plaid.com", "sec-fetch-site": "cross-site" } })), true);
  assert.equal(isTrustedMutation(new Request("https://app.example/api/workspaces/1", { method: "GET", headers: { origin: "https://evil.example" } })), true);
});
