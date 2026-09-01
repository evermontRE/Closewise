import assert from "node:assert/strict";
import test from "node:test";
import { defaultMileageRate, mileageDeduction, normalizeMileageRate, normalizeMiles } from "./mileage.ts";

test("uses the 2026 mileage rate", () => assert.equal(defaultMileageRate("2026-08-19"), "0.7250"));
test("normalizes miles and deliberate rates", () => {
  assert.equal(normalizeMiles("12.345"), "12.35");
  assert.equal(normalizeMileageRate("0.7"), "0.7000");
});
test("calculates mileage, parking, and tolls without floating point", () => {
  assert.equal(mileageDeduction("100.00", "0.7250", "4.25", "2.00"), "78.75");
  assert.equal(mileageDeduction("1.01", "0.7250"), "0.73");
});
