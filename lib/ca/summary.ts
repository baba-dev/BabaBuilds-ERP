import { Prisma } from "@prisma/client";
import { advanceTaxSchedule, computeIndiaTax, type IndiaTaxpayerType } from "@/lib/tax/india-income-tax";
import type { CaSetup, EntityType } from "./calendar";
import { fyLabel } from "./fy";

export type YearFigures = {
  /** Invoiced in the year, GST taken out, less credit notes against earlier years. */
  billed: number;
  /** Cash received in the year, GST taken out (what presumptive taxation is tested on). */
  received: number;
  /** Bills and expenses, with GST that is claimed back as credit taken out. */
  expenses: number;
  /** Posted payroll cost (earnings plus employer costs). */
  payroll: number;
  /** Credit on purchases the books claim. */
  itcClaimed: number;
  /** Tax withheld by customers (a credit against your tax). */
  tdsCredits: number;
  /** Tax you deducted from payments to others, and how much of it has been deposited. */
  tdsDeducted: number;
  tdsDeposited: number;
  invoiceCount: number;
};

export const EMPTY_FIGURES: YearFigures = { billed: 0, received: 0, expenses: 0, payroll: 0, itcClaimed: 0, tdsCredits: 0, tdsDeducted: 0, tdsDeposited: 0, invoiceCount: 0 };

const TAXPAYER: Record<EntityType, IndiaTaxpayerType> = { PROPRIETOR: "individual", PARTNERSHIP: "firm", LLP: "firm", COMPANY: "company", OTHER: "aop" };

export type TaxEstimate = {
  basis: "BOOKS" | "PRESUMPTIVE";
  taxableIncome: number;
  tax: number;
  /** Tax less credits (TDS withheld by customers). Never negative. */
  payable: number;
  regime: "new" | "old";
  warnings: string[];
};

/**
 * Rough income-tax for the year so the calendar can show advance-tax amounts. Books-based profit by default, or the deemed
 * income under the chosen presumptive scheme. Old-regime deductions are not inferred. An estimate for planning, not advice.
 */
export function estimateYearTax(args: { startYear: number; setup: CaSetup; figures: YearFigures; presumptiveIncome: number | null }): TaxEstimate | null {
  const { setup, figures } = args;
  if (!setup.entityType) return null;
  const profit = Math.max(0, figures.billed - figures.expenses - figures.payroll);
  const presumptive = setup.presumptive !== "NONE" && args.presumptiveIncome !== null;
  const income = presumptive ? args.presumptiveIncome ?? 0 : profit;
  const regime = setup.taxRegime === "OLD" ? "old" : "new";
  const fy = fyLabel(args.startYear);
  const result = computeIndiaTax({
    fy,
    regime,
    taxpayerType: TAXPAYER[setup.entityType],
    residentIndividual: setup.entityType === "PROPRIETOR",
    ageGroup: "below60",
    taxableIncome: new Prisma.Decimal(Math.round(income)),
    standardDeduction: false,
  });
  const tax = Math.round(result.final.toNumber());
  return { basis: presumptive ? "PRESUMPTIVE" : "BOOKS", taxableIncome: Math.round(income), tax, payable: Math.max(0, tax - Math.round(figures.tdsCredits)), regime, warnings: result.warnings };
}

export { advanceTaxSchedule };
