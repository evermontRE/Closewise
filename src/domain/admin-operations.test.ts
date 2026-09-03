import assert from "node:assert/strict";
import test from "node:test";
import { parseSupportAction, roleCanPerform } from "./admin-operations.ts";

test("normalizes an auditable support note", () => {
  assert.deepEqual(parseSupportAction({ action: "add_note", reason: " Customer requested a billing review. ", note: " Follow up Friday. " }), {
    action: "add_note",
    reason: "Customer requested a billing review.",
    note: "Follow up Friday.",
    sessionId: null,
  });
});

test("requires meaningful reasons and valid review identifiers", () => {
  assert.throws(() => parseSupportAction({ action: "suspend", reason: "fraud" }), /between 10 and 500/);
  assert.throws(() => parseSupportAction({ action: "end_review", reason: "Investigation completed.", sessionId: "bad" }), /valid support review/);
});

test("keeps suspension admin-only and auditors read-only", () => {
  assert.equal(roleCanPerform("admin", "suspend"), true);
  assert.equal(roleCanPerform("support", "suspend"), false);
  assert.equal(roleCanPerform("support", "add_note"), true);
  assert.equal(roleCanPerform("auditor", "add_note"), false);
});
