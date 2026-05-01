import test from "node:test";
import assert from "node:assert/strict";
import { describe } from "node:test";

import { InvoiceValidationError } from "@/lib/invoice/generation-context";

describe("InvoiceValidationError", () => {
  test("preserves status and payload", () => {
    const err = new InvoiceValidationError(422, { error: "Tax rate required", code: "TAX_RATE_REQUIRED" });
    assert.equal(err.status, 422);
    assert.equal(err.payload.code, "TAX_RATE_REQUIRED");
    assert.equal(err.message, "Tax rate required");
  });

  test("falls back to generic message when payload lacks error", () => {
    const err = new InvoiceValidationError(400, { code: "UNKNOWN" }, "Fallback");
    assert.equal(err.status, 400);
    assert.equal(err.message, "Fallback");
  });
});
