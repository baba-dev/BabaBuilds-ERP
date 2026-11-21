import { r2 } from "@/lib/gst/money";

/** How many open items the Statement design lists; the previous balance always counts all of them. */
export const MAX_STATEMENT_ITEMS = 8;

export type StatementInput = {
  /** What the client still owes on earlier invoices (all of them, even those not listed). */
  previousBalance: number;
  openItems: Array<{ number: string; date: Date; dueDate: Date | null; balance: number }>;
  /** Open items beyond MAX_STATEMENT_ITEMS that are counted in the balance but not listed. */
  hiddenOpenItems: number;
  /** Payments received since the previous invoice. */
  payments: Array<{ date: Date; amount: number; method: string | null; reference: string | null }>;
  /** Credit notes issued since the previous invoice. */
  credits: Array<{ number: string; date: Date; amount: number }>;
  /** Date of the client's previous invoice, or null for a first invoice. */
  sinceDate: Date | null;
};

type StatementInvoice = {
  number: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  status: string;
  payments: Array<{ amount: number; receivedAt: Date; method: string; reference: string | null; reversedAt: Date | null }>;
  creditNotes: Array<{ number: string; amount: number; taxAmount: number; issuedAt: Date }>;
};

/**
 * Pure statement maths. Open items are earlier, non-void invoices with a balance left after live payments and credit
 * notes (credit notes count with their tax). Payments and credits shown are those since the previous invoice.
 */
export const buildStatement = (args: { invoices: StatementInvoice[]; currentInvoiceDate: Date }): StatementInput => {
  const earlier = args.invoices.filter((i) => i.status !== "VOID" && i.date.getTime() < args.currentInvoiceDate.getTime());
  if (earlier.length === 0) return { previousBalance: 0, openItems: [], hiddenOpenItems: 0, payments: [], credits: [], sinceDate: null };

  const sinceDate = new Date(Math.max(...earlier.map((i) => i.date.getTime())));
  const since = sinceDate.getTime();

  const withBalance = earlier.map((i) => {
    const received = i.payments.filter((p) => !p.reversedAt).reduce((sum, p) => sum + p.amount, 0);
    const credited = i.creditNotes.reduce((sum, c) => sum + c.amount + c.taxAmount, 0);
    return { invoice: i, balance: Math.max(0, r2(i.total - received - credited)) };
  });

  const open = withBalance
    .filter((x) => x.balance > 0)
    .sort((a, b) => a.invoice.date.getTime() - b.invoice.date.getTime() || a.invoice.number.localeCompare(b.invoice.number));

  return {
    previousBalance: r2(open.reduce((sum, x) => sum + x.balance, 0)),
    openItems: open.slice(0, MAX_STATEMENT_ITEMS).map((x) => ({ number: x.invoice.number, date: x.invoice.date, dueDate: x.invoice.dueDate, balance: x.balance })),
    hiddenOpenItems: Math.max(0, open.length - MAX_STATEMENT_ITEMS),
    payments: earlier
      .flatMap((i) => i.payments.filter((p) => !p.reversedAt && p.receivedAt.getTime() >= since).map((p) => ({ date: p.receivedAt, amount: r2(p.amount), method: p.method || null, reference: p.reference })))
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    credits: earlier
      .flatMap((i) => i.creditNotes.filter((c) => c.issuedAt.getTime() >= since).map((c) => ({ number: c.number, date: c.issuedAt, amount: r2(c.amount + c.taxAmount) })))
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    sinceDate,
  };
};
