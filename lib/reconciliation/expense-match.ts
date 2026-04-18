import type { Expense } from "@prisma/client";

export type ExpenseMatchCandidate = {
  expense: Expense;
  score: number;
  reasons: string[];
};

/**
 * Suggest recent expenses that may duplicate this bank debit (duplicate payment detection).
 */
export function rankExpenseMatchesForDebit(args: {
  expenses: Expense[];
  amount: number;
  narration: string;
  lookbackDays?: number;
}): ExpenseMatchCandidate[] {
  const amount = Math.round(args.amount * 100) / 100;
  const hay = args.narration.toLowerCase();
  const days = args.lookbackDays ?? 120;
  const cutoff = Date.now() - days * 86_400_000;

  const out: ExpenseMatchCandidate[] = [];
  for (const exp of args.expenses) {
    const expDate = new Date(exp.date).getTime();
    if (expDate < cutoff) continue;
    const expAmt = Math.round(Number(exp.amount) * 100) / 100;
    if (Math.abs(expAmt - amount) > 0.02) continue;

    let score = 50;
    const reasons: string[] = ["amount_match_recent_window"];

    const vendor = exp.vendor.trim().toLowerCase();
    if (vendor.length >= 3 && hay.includes(vendor.slice(0, 12))) {
      score += 40;
      reasons.push("vendor_in_narration");
    }

    const cat = exp.category.trim().toLowerCase();
    if (cat.length >= 3 && hay.includes(cat)) {
      score += 10;
      reasons.push("category_token_in_narration");
    }

    out.push({ expense: exp, score, reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 5);
}
