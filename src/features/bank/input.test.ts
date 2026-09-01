import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BankInputError, parseBankAccountInput, parseBankImportInput, parseBankReviewInput } from "./input.ts";

const id = "10000000-0000-4000-8000-000000000001";

describe("bank workflow input", () => {
  it("normalizes a bank account", () => {
    assert.deepEqual(parseBankAccountInput({ accountName: " Operating ", accountType: "checking", currency: "usd", mask: "1234" }), {
      institutionName: null, accountName: "Operating", accountType: "checking", mask: "1234", currency: "USD", isActive: true, deviceId: "web",
    });
  });

  it("parses quoted CSV rows and US dates", () => {
    const result = parseBankImportInput({
      bankAccountId: id, fileName: "statement.csv",
      csvText: 'Date,Description,Amount,Merchant,Id\n08/31/2026,"Print, Local",(125.40),Print Shop,txn-1',
    });
    assert.equal(result.rows[0].postedDate, "2026-08-31");
    assert.equal(result.rows[0].description, "Print, Local");
    assert.equal(result.rows[0].amount, "-125.40");
  });

  it("supports separate debit and credit columns", () => {
    const result = parseBankImportInput({ bankAccountId: id, fileName: "statement.csv", csvText: "Date,Description,Debit,Credit\n2026-08-31,Expense,10.25,\n2026-09-01,Deposit,,50" });
    assert.deepEqual(result.rows.map((row) => row.amount), ["-10.25", "50.00"]);
  });

  it("rejects missing CSV columns", () => {
    assert.throws(() => parseBankImportInput({ bankAccountId: id, fileName: "bad.csv", csvText: "Date,Amount\n2026-08-31,10" }), BankInputError);
  });

  it("requires a category for categorization", () => {
    assert.throws(() => parseBankReviewInput({ action: "categorize" }), BankInputError);
  });

  it("requires a match target and meaningful ignore reason", () => {
    assert.throws(() => parseBankReviewInput({ action: "match" }), BankInputError);
    assert.throws(() => parseBankReviewInput({ action: "ignore", reason: "no" }), BankInputError);
  });
});
