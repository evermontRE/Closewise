import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LEGACY_BACKUP_BYTES, mutationTitle, readLegacyFile, shortDeviceId, totalRecords } from "./model.ts";

test("reads a valid JSON object and rejects invalid backups", () => {
  assert.deepEqual(readLegacyFile('{"evermont":{"schema":"evermont.finance.v1"}}', 48), { evermont: { schema: "evermont.finance.v1" } });
  assert.throws(() => readLegacyFile("not-json", 8), /not a valid Finance Studio/);
  assert.throws(() => readLegacyFile("{}", MAX_LEGACY_BACKUP_BYTES + 1), /smaller than 25 MB/);
});

test("creates plain-English queue labels and compact device IDs", () => {
  assert.equal(mutationTitle({ method: "PATCH", url: "/api/workspaces/1/bank-transactions/2" }), "Update 2");
  assert.equal(mutationTitle({ method: "POST", url: "/api/workspaces/1/recurring-expenses" }), "Create recurring expenses");
  assert.equal(shortDeviceId("device-2fd869da-0fb1-4e66"), "2FD869DA");
});

test("adds source record counts", () => {
  assert.equal(totalRecords({ clients: { source: 3 }, ledger: { source: 7 } }), 10);
});
