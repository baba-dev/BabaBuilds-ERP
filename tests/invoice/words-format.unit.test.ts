import { describe, expect, it } from "vitest";

import { amountInWords } from "@/lib/invoice-templates/shared/words";
import { formatMoney } from "@/lib/invoice-templates/shared/format";

describe("amountInWords", () => {
  it("writes rupees with lakh/crore grouping and paise", () => {
    expect(amountInWords(123456.5, "INR")).toBe("Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only");
    expect(amountInWords(0, "INR")).toBe("Rupees Zero Only");
    expect(amountInWords(1, "INR")).toBe("Rupees One Only");
    expect(amountInWords(10000000, "INR")).toBe("Rupees One Crore Only");
    expect(amountInWords(99.01, "INR")).toBe("Rupees Ninety-Nine and One Paise Only");
    expect(amountInWords(1000, "INR")).toBe("Rupees One Thousand Only");
  });

  it("returns null for other currencies and unusable amounts", () => {
    expect(amountInWords(100, "USD")).toBeNull();
    expect(amountInWords(-5, "INR")).toBeNull();
    expect(amountInWords(Number.NaN, "INR")).toBeNull();
    expect(amountInWords(Number.POSITIVE_INFINITY, "INR")).toBeNull();
  });

  it("rounds to the nearest paisa", () => {
    expect(amountInWords(0.999, "INR")).toBe("Rupees One Only");
    expect(amountInWords(10.004, "INR")).toBe("Rupees Ten Only");
  });
});

describe("formatMoney", () => {
  it("formats with the currency symbol and locale grouping", () => {
    expect(formatMoney(123456.5, "INR", "en-IN")).toBe("₹1,23,456.50");
    expect(formatMoney(1000, "USD", "en-US")).toBe("$1,000.00");
    expect(formatMoney(0, "INR", "en-IN")).toBe("₹0.00");
  });

  it("falls back to a plain number for an unknown currency code", () => {
    expect(() => formatMoney(10, "???", "en-IN")).not.toThrow();
  });
});
