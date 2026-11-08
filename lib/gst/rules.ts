/**
 * GST filing rules in one place so a notification change is a one-file edit.
 * Everything here reflects CGST Act / rules and CBIC notifications as understood at build time and is shown to
 * users as an estimate; due dates and fees are overridable per return (extensions) and must be verified on the portal.
 */
export const GST_RULES = {
  /** B2C inter-state invoices above this (invoice value, INR) are reported invoice-wise as B2CL (Notification 12/2024-CT). */
  b2clThreshold: 100000,
  /** Up to this previous-FY turnover, HSN is reported at 4 digits; above, 6 digits. */
  hsn6DigitAbove: 50000000,
  /** E-invoicing applies above this aggregate turnover. */
  eInvoiceAbove: 50000000,
  /** GSTR-9 is optional up to this turnover (subject to the year's notification). */
  gstr9OptionalUpTo: 20000000,
  /** GSTR-9C (reconciliation statement) applies above this turnover. */
  gstr9cAbove: 50000000,
  interestRate: 0.18,
  excessItcInterestRate: 0.24,
  /** GSTR-1 / GSTR-3B late fee: per day, split equally between CGST and SGST. */
  lateFeePerDay: { regular: 50, nil: 20 },
  /** Max late fee per return by previous-FY turnover tier. [upToTurnover, capRegular, capNil] */
  lateFeeCaps: [
    { upTo: 15000000, regular: 2000, nil: 500 },
    { upTo: 50000000, regular: 5000, nil: 2000 },
    { upTo: Number.POSITIVE_INFINITY, regular: 10000, nil: 5000 },
  ],
  /** GSTR-9 late fee: per day and cap as a share of turnover, by tier. */
  gstr9LateFee: [
    { upTo: 50000000, perDay: 50, capShare: 0.0004 },
    { upTo: 200000000, perDay: 100, capShare: 0.0004 },
    { upTo: Number.POSITIVE_INFINITY, perDay: 200, capShare: 0.005 },
  ],
} as const;

export type ReturnType = "GSTR1" | "IFF" | "GSTR3B" | "PMT06" | "CMP08" | "GSTR4" | "GSTR9" | "GSTR9C";

export const RETURN_LABEL: Record<ReturnType, string> = {
  GSTR1: "GSTR-1",
  IFF: "IFF",
  GSTR3B: "GSTR-3B",
  PMT06: "PMT-06",
  CMP08: "CMP-08",
  GSTR4: "GSTR-4",
  GSTR9: "GSTR-9",
  GSTR9C: "GSTR-9C",
};

export function lateFeeCap(turnover: number, isNil: boolean): number {
  const tier = GST_RULES.lateFeeCaps.find((t) => turnover <= t.upTo) ?? GST_RULES.lateFeeCaps[2];
  return isNil ? tier.nil : tier.regular;
}
