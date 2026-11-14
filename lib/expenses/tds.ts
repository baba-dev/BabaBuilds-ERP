export type TdsSuggestion = { code: string; labelKey: "contractor" | "rent" | "professional" | "technical" | "commission"; ratePercent: number; thresholdNote: "perPayment30k" | "yearly6l" | "yearly50k" | "yearly20k" };

/**
 * Typical tax-deducted-at-source treatment for a payment to an Indian vendor, as a starting point for the form.
 * Rates and section numbers follow the long-standing Income-tax Act scheme (the Income-tax Act, 2025 renumbers the sections
 * from April 2026); thresholds change by Finance Act, so this is only a suggestion and the CA's view wins.
 * Software, hosting and other foreign vendors return nothing: payments abroad follow different rules.
 */
export function suggestTds(input: { category: string; vendorGstin?: string | null; vendorMsme?: string | null; amount: number; foreign?: boolean }): TdsSuggestion | null {
  if (input.foreign || input.amount <= 0) return null;
  const c = input.category.trim().toLowerCase();
  if (c === "sub-contractors" || c.includes("contractor") || c.includes("freelanc")) return { code: "194C", labelKey: "contractor", ratePercent: 1, thresholdNote: "perPayment30k" };
  if (c === "office & rent" || c.includes("rent")) return { code: "194I", labelKey: "rent", ratePercent: 10, thresholdNote: "yearly6l" };
  if (c.includes("professional") || c.includes("legal") || c.includes("consult") || c.includes("audit")) return { code: "194J", labelKey: "professional", ratePercent: 10, thresholdNote: "yearly50k" };
  if (c.includes("commission") || c.includes("brokerage")) return { code: "194H", labelKey: "commission", ratePercent: 2, thresholdNote: "yearly20k" };
  return null;
}
