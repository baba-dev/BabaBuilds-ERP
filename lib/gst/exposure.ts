import { estimateInterest } from "./fees";
import { r2 } from "./money";
import type { ObligationView } from "./service";

export type GstExposure = { lateFee: number; interest: number; total: number; overdueCount: number };

/** What being late has cost so far: estimated late fees on overdue returns plus interest on unpaid cash tax. */
export function exposureOf(obligations: ObligationView[]): GstExposure {
  let lateFee = 0;
  let interest = 0;
  let overdueCount = 0;
  for (const o of obligations) {
    if (o.status !== "OVERDUE" || o.optional) continue;
    overdueCount += 1;
    lateFee += o.lateFeeEstimate;
    if (o.returnType === "GSTR3B" && o.figures) interest += estimateInterest(o.figures.cashPayable, o.daysLate);
  }
  return { lateFee: r2(lateFee), interest: r2(interest), total: r2(lateFee + interest), overdueCount };
}
