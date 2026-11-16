/** End-of-shift cash arithmetic, in whole paise so a count never drifts by a fraction. */
const paise = (n: number) => Math.round((n + Number.EPSILON) * 100);
const rupees = (p: number) => p / 100;

export type CashPayment = { method: string; amount: number };

/** What the till should hold (cash payments only) and how the whole shift was paid. */
export function summarizeShift(payments: CashPayment[]) {
  const byMethod = new Map<string, { count: number; paise: number }>();
  for (const p of payments) {
    const cur = byMethod.get(p.method) ?? { count: 0, paise: 0 };
    cur.count += 1;
    cur.paise += paise(p.amount);
    byMethod.set(p.method, cur);
  }
  return {
    expectedCash: rupees(byMethod.get('CASH')?.paise ?? 0),
    total: rupees([...byMethod.values()].reduce((s, m) => s + m.paise, 0)),
    byMethod: [...byMethod.entries()].map(([method, v]) => ({ method, count: v.count, amount: rupees(v.paise) })).sort((a, b) => b.amount - a.amount),
  };
}

/** Counted minus expected: negative means the till is short. */
export function cashVariance(expected: number, counted: number): number {
  return rupees(paise(counted) - paise(expected));
}

/** Small differences are rounding at the counter; anything bigger needs a note. */
export function varianceNeedsNote(variance: number, tolerance = 0): boolean {
  return Math.abs(paise(variance)) > paise(tolerance);
}

export type OutstandingInvoice = { total: number; received: number; dueDate: Date | null; status: string };

/** What a customer still owes, and how much of it is past due. Void and paid invoices count for nothing. */
export function customerBalance(invoices: OutstandingInvoice[], now = new Date()) {
  let owed = 0, overdue = 0, open = 0;
  for (const i of invoices) {
    if (i.status === 'VOID') continue;
    const bal = paise(i.total) - paise(i.received);
    if (bal <= 0) continue;
    owed += bal; open += 1;
    if (i.dueDate && i.dueDate.getTime() < now.getTime()) overdue += bal;
  }
  return { owed: rupees(owed), overdue: rupees(overdue), open };
}
