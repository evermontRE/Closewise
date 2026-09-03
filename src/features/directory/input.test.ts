import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DirectoryInputError,
  parseClientInput,
  parsePropertyInput,
  parseVoidInput,
} from "./input.ts";

describe("directory input", () => {
  it("normalizes a client", () => {
    const result = parseClientInput({
      displayName: "  Avery Morgan  ",
      email: "AVERY@EXAMPLE.COM",
      phone: "  555-0100 ",
    });
    assert.equal(result.displayName, "Avery Morgan");
    assert.equal(result.email, "avery@example.com");
    assert.equal(result.phone, "555-0100");
    assert.equal(result.deviceId, "web");
  });

  it("rejects a missing name and malformed email", () => {
    assert.throws(
      () => parseClientInput({ displayName: " ", email: "avery.example.com" }),
      (error: unknown) => {
        assert.ok(error instanceof DirectoryInputError);
        assert.ok(error.fields.displayName);
        assert.ok(error.fields.email);
        return true;
      },
    );
  });

  it("normalizes a US property address", () => {
    const result = parsePropertyInput({
      addressLine1: "  42 Main Street ",
      city: "Boston",
      region: "MA",
      postalCode: "02108",
    });
    assert.equal(result.country, "US");
    assert.equal(result.normalizedAddress, "42 main street boston ma 02108 us");
  });

  it("rejects a missing address and invalid country", () => {
    assert.throws(
      () => parsePropertyInput({ country: "USA" }),
      (error: unknown) => {
        assert.ok(error instanceof DirectoryInputError);
        assert.ok(error.fields.addressLine1);
        assert.ok(error.fields.country);
        return true;
      },
    );
  });

  it("requires a meaningful void reason", () => {
    assert.throws(() => parseVoidInput({ reason: "old" }), DirectoryInputError);
    assert.deepEqual(parseVoidInput({ reason: "Duplicate record" }), {
      reason: "Duplicate record",
      deviceId: "web",
    });
  });
});
