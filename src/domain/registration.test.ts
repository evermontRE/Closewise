import test from "node:test";
import assert from "node:assert/strict";
import { registrationCopy, registrationMode } from "../lib/registration.ts";

test("registration defaults to private beta", () => {
  assert.equal(registrationMode(undefined), "beta");
  assert.equal(registrationCopy("beta").canRegister, false);
});

test("only explicit open registration enables sign up", () => {
  assert.equal(registrationCopy(registrationMode("open")).canRegister, true);
  assert.equal(registrationMode("unexpected"), "beta");
  assert.equal(registrationCopy("closed").canRegister, false);
});
