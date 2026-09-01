import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReceiptInputError, parseReceiptIntentInput, parseReceiptVoidInput } from "./input.ts";

const recordId = "10000000-0000-4000-8000-000000000001";

describe("receipt input", () => {
  it("normalizes safe receipt metadata", () => {
    const result = parseReceiptIntentInput({ recordType: "transaction", recordId, fileName: "../Closing Statement (Final).PDF", mimeType: "application/pdf", sizeBytes: 1024 });
    assert.equal(result.fileName, "../Closing Statement (Final).PDF");
    assert.equal(result.safeFileName, "Closing-Statement-Final.pdf");
  });
  it("normalizes image extensions from MIME type", () => {
    assert.equal(parseReceiptIntentInput({ recordType: "commission", recordId, fileName: "photo.exe", mimeType: "image/jpeg", sizeBytes: 5 }).safeFileName, "photo.jpg");
  });
  it("rejects unsupported file types and oversized files", () => {
    assert.throws(() => parseReceiptIntentInput({ recordType: "transaction", recordId, fileName: "bad.svg", mimeType: "image/svg+xml", sizeBytes: 11 * 1024 * 1024 }), ReceiptInputError);
  });
  it("rejects malformed checksums", () => {
    assert.throws(() => parseReceiptIntentInput({ recordType: "transaction", recordId, fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: "bad" }), ReceiptInputError);
  });
  it("requires meaningful void reasons", () => { assert.throws(() => parseReceiptVoidInput({ reason: "no" }), ReceiptInputError); });
});
