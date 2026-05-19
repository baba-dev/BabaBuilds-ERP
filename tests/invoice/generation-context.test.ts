import { describe, expect, it } from "vitest";
import { InvoiceValidationError } from "@/lib/invoice/generation-context";

describe("InvoiceValidationError", () => {
  it("preserves status and payload", () => {
    const err = new InvoiceValidationError(422, { error: "Tax rate required", code: "TAX_RATE_REQUIRED" });
    expect(err.status).toBe(422);
    expect(err.payload.code).toBe("TAX_RATE_REQUIRED");
    expect(err.message).toBe("Tax rate required");
  });

  it("falls back to generic message when payload lacks error", () => {
    const err = new InvoiceValidationError(400, { code: "UNKNOWN" }, "Fallback");
    expect(err.status).toBe(400);
    expect(err.message).toBe("Fallback");
  });
});
