import { GST_RULES, lateFeeCap, type ReturnType } from "./rules";
import { r2 } from "./money";

/** Late fee for GSTR-1 / GSTR-3B style returns: per-day fee, capped by turnover tier. Estimate only. */
export function estimateLateFee(args: { returnType: ReturnType; daysLate: number; isNil: boolean; prevTurnover: number; annualTurnover?: number }): number {
  const { returnType, daysLate, isNil, prevTurnover } = args;
  if (daysLate <= 0) return 0;
  if (returnType === "GSTR9" || returnType === "GSTR9C") {
    const turnover = args.annualTurnover ?? prevTurnover;
    const tier = GST_RULES.gstr9LateFee.find((t) => prevTurnover <= t.upTo) ?? GST_RULES.gstr9LateFee[2];
    return r2(Math.min(daysLate * tier.perDay, turnover * tier.capShare));
  }
  if (returnType === "PMT06" || returnType === "IFF") return 0;
  const perDay = isNil ? GST_RULES.lateFeePerDay.nil : GST_RULES.lateFeePerDay.regular;
  return r2(Math.min(daysLate * perDay, lateFeeCap(prevTurnover, isNil)));
}

/** Interest on tax paid in cash after the due date: 18% p.a. on the delayed amount. Estimate only. */
export function estimateInterest(delayedCashTax: number, daysLate: number, rate: number = GST_RULES.interestRate): number {
  if (delayedCashTax <= 0 || daysLate <= 0) return 0;
  return r2((delayedCashTax * rate * daysLate) / 365);
}
