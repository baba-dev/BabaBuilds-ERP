import type { ParsedBankTransaction } from "./bank-csv-parse";

const EPS = 0.02;

/**
 * Flag running-balance breaks using file row order (no reordering by date).
 */
export function annotateRunningBalanceContinuity(
  rows: ParsedBankTransaction[],
): ParsedBankTransaction[] {
  let implied: number | null = null;
  return rows.map((row, idx) => {
    const flags = { ...(row.parseFlags as Record<string, unknown> | undefined) };
    const after = row.balanceAfter ?? row.balance;
    if (after === undefined || !Number.isFinite(after)) {
      return { ...row, parseFlags: Object.keys(flags).length ? flags : row.parseFlags };
    }
    const signed =
      row.type === "DEBIT" ? -Math.abs(row.amount) : Math.abs(row.amount);
    if (implied === null) {
      implied = after - signed;
    } else {
      const nextImplied = implied + signed;
      if (Math.abs(nextImplied - after) > EPS) {
        flags.balanceBreak = true;
        flags.balanceBreakIndex = idx;
        flags.expectedBalanceAfter = nextImplied;
        flags.statementBalanceAfter = after;
      }
      implied = after;
    }
    return {
      ...row,
      balanceAfter: after,
      parseFlags: Object.keys(flags).length ? flags : row.parseFlags,
    };
  });
}
