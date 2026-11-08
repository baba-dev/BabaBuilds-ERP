/**
 * Statutory dates and thresholds the CA calendar uses, in one file so a notification or Budget change is one edit.
 * They follow the Income-tax Act, TDS rules, EPF/ESI schemes and MCA/LLP annual-filing conventions as understood at build
 * time. FY / tax year 2026-27 is the first under the Income-tax Act 2025, which keeps these dates. Extensions are
 * recorded per item; verify every date on the portal before relying on it.
 */
export const CA_RULES = {
  /** Advance tax is not payable when the year's liability is below this. */
  advanceTaxMinimum: 10000,
  /** [month (0-based), day, cumulative percent] of the year's tax, in the FY's start year (Mar falls in the next). */
  advanceTaxInstalments: [
    { month: 5, day: 15, percent: 15 },
    { month: 8, day: 15, percent: 45 },
    { month: 11, day: 15, percent: 75 },
    { month: 2, day: 15, percent: 100 },
  ],
  /** TDS/TCS deposit: 7th of the next month; March deductions by 30 April. */
  tdsDepositDay: 7,
  tdsMarchDepositDue: { month: 3, day: 30 },
  /** Quarterly TDS returns (24Q salary, 26Q other), by quarter of the FY. */
  tdsReturnDue: [
    { quarter: 1, month: 6, day: 31, nextYear: false },
    { quarter: 2, month: 9, day: 31, nextYear: false },
    { quarter: 3, month: 0, day: 31, nextYear: true },
    { quarter: 4, month: 4, day: 31, nextYear: true },
  ],
  form16Due: { month: 5, day: 15 },
  /** Employees' provident fund and ESI contributions: 15th of the next month. */
  providentFundDay: 15,
  /** ITR due dates, in the calendar year after the FY. */
  itrNonAudit: { month: 6, day: 31 },
  itrAudit: { month: 9, day: 31 },
  taxAuditReport: { month: 8, day: 30 },
  /** MCA / LLP annual filings, assuming an AGM held by 30 September. */
  rocCompany: { aoc4: { month: 9, day: 30 }, mgt7: { month: 10, day: 29 }, dir3Kyc: { month: 8, day: 30 } },
  rocLlp: { form11: { month: 4, day: 30 }, form8: { month: 9, day: 30 } },
  /** Internal target for closing the books and getting the CA's sign-off. Not statutory. */
  yearCloseTarget: { month: 5, day: 30 },
  /** "Due soon" window in days. */
  dueSoonDays: 14,
  /** Presumptive taxation limits (section 44AD / 44ADA; 44ADA applies to resident individuals and firms other than LLPs). */
  presumptive: {
    ada: { limit: 5000000, limitHighCashFree: 7500000, deemedRate: 0.5 },
    ad: { limit: 20000000, limitHighCashFree: 30000000, deemedRateDigital: 0.06, deemedRateOther: 0.08 },
  },
  /** Tax audit (section 44AB) turnover tests. */
  taxAudit: { business: 10000000, businessHigh: 100000000, profession: 5000000 },
  /** GST registration turnover thresholds for a supplier of services (aggregate turnover in the year). */
  gstRegistration: { services: 2000000, servicesSpecialCategory: 1000000, goods: 4000000 },
} as const;

export const CA_RULES_NOTE = "Dates and thresholds are from public tax and company-law sources. Confirm against the portal and notifications; record any extension on the item.";
