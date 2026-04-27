import { describe, expect, it } from "vitest";

import { buildInvoiceGenerateErrorMessage } from "@/lib/invoice/generate-error-message";

describe("buildInvoiceGenerateErrorMessage", () => {
  it("prefers field-level validation details", () => {
    const message = buildInvoiceGenerateErrorMessage(
      {
        error: "Validation failed",
        fields: [
          { field: "billingMonth", message: "Billing month is required." },
          { field: "services.amount", message: "Service amount must be >= 0." },
        ],
      },
      "Failed to generate",
    );

    expect(message).toBe(
      "billingMonth: Billing month is required. services.amount: Service amount must be >= 0.",
    );
  });

  it("falls back to base error and default", () => {
    expect(
      buildInvoiceGenerateErrorMessage({ error: "Failed to generate" }, "Fallback"),
    ).toBe("Failed to generate");
    expect(
      buildInvoiceGenerateErrorMessage({}, "Fallback"),
    ).toBe("Fallback");
  });
});
