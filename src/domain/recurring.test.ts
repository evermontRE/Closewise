import assert from "node:assert/strict";
import test from "node:test";
import { annualizedRecurringAmount, nextRecurringDate } from "./recurring.ts";

test("annualizes recurring obligations with exact cents", () => {
  assert.equal(annualizedRecurringAmount("29.99", "monthly"), "359.88");
  assert.equal(annualizedRecurringAmount("125.50", "quarterly"), "502.00");
});
test("advances renewal dates without skipping month ends", () => {
  assert.equal(nextRecurringDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextRecurringDate("2026-02-28", "annual"), "2027-02-28");
  assert.equal(nextRecurringDate("2026-12-28", "weekly"), "2027-01-04");
});
