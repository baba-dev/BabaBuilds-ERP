import { CA_RULES } from "./rules";
import type { EntityType } from "./calendar";

export type LimitStatus = "WITHIN" | "WITHIN_IF_LOW_CASH" | "ABOVE";

export type PresumptiveView = {
  receipts: number;
  /** Section 44ADA: specified professions, resident individuals and partnership firms (not LLPs). */
  ada: { entityEligible: boolean; status: LimitStatus; limit: number; limitIfLowCash: number; deemedIncome: number };
  /** Section 44AD: eligible businesses (not professions); 6% of digital receipts, 8% of others. */
  ad: { entityEligible: boolean; status: LimitStatus; limit: number; limitIfLowCash: number; deemedIncomeDigital: number; deemedIncomeOther: number };
  /** Section 44AB: a hint for the CA to confirm, not a determination. */
  taxAudit: "LIKELY" | "CHECK" | "UNLIKELY";
};

function limitStatus(receipts: number, limit: number, high: number): LimitStatus {
  if (receipts <= limit) return "WITHIN";
  if (receipts <= high) return "WITHIN_IF_LOW_CASH";
  return "ABOVE";
}

/** What the presumptive schemes would mean for this year's receipts (GST-exclusive). Profession or business cannot be told from the books, so the CA confirms. */
export function presumptiveView(entity: EntityType | null, receipts: number): PresumptiveView {
  const r = Math.max(0, receipts);
  const ada = CA_RULES.presumptive.ada;
  const ad = CA_RULES.presumptive.ad;
  const entityEligible = entity === "PROPRIETOR" || entity === "PARTNERSHIP";
  const audit = CA_RULES.taxAudit;
  return {
    receipts: r,
    ada: { entityEligible, status: limitStatus(r, ada.limit, ada.limitHighCashFree), limit: ada.limit, limitIfLowCash: ada.limitHighCashFree, deemedIncome: Math.round(r * ada.deemedRate) },
    ad: { entityEligible, status: limitStatus(r, ad.limit, ad.limitHighCashFree), limit: ad.limit, limitIfLowCash: ad.limitHighCashFree, deemedIncomeDigital: Math.round(r * ad.deemedRateDigital), deemedIncomeOther: Math.round(r * ad.deemedRateOther) },
    taxAudit: r > audit.business ? "LIKELY" : r > audit.profession ? "CHECK" : "UNLIKELY",
  };
}

export type GstRegistrationHint = "REGISTERED" | "REGISTRATION_MAY_BE_REQUIRED" | "BELOW_THRESHOLD" | "NOT_APPLICABLE";

/** Compares aggregate turnover with the registration thresholds (services ₹20 lakh; ₹10 lakh in special-category states). Goods suppliers have ₹40 lakh. */
export function gstRegistrationHint(args: { registered: boolean; countryIsIndia: boolean; turnover: number }): GstRegistrationHint {
  if (!args.countryIsIndia) return "NOT_APPLICABLE";
  if (args.registered) return "REGISTERED";
  return args.turnover > CA_RULES.gstRegistration.services ? "REGISTRATION_MAY_BE_REQUIRED" : "BELOW_THRESHOLD";
}
