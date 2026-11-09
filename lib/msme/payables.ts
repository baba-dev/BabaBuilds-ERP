import { MSME_RULES } from "./rules";
import { isMicroOrSmall } from "./udyam";

export type MsmePayableInput = {
  id: string;
  vendor: string;
  date: Date;
  amount: number;
  paid: boolean;
  paidAt: Date | null;
  vendorMsme: string | null;
  vendorUdyam: string | null;
  /** Agreed credit days from a written agreement, if any. */
  agreedDays?: number | null;
};

export type MsmePayable = {
  id: string;
  vendor: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  state: "OVERDUE_UNPAID" | "PAID_LATE" | "DUE_SOON" | "OK";
};

const DAY = 86_400_000;

/** Days allowed for paying a micro or small enterprise: the agreed days, never more than 45; 15 when nothing is agreed. */
export function allowedDays(agreedDays: number | null | undefined): number {
  if (agreedDays === null || agreedDays === undefined || agreedDays <= 0) return MSME_RULES.payment.noAgreementDays;
  return Math.min(agreedDays, MSME_RULES.payment.maxDays);
}

/**
 * Section 43B(h): amounts owed to a micro or small enterprise and not paid within the allowed days by the end of the year
 * are disallowed for that year and deducted only when paid. This lists every such bill so the books can be fixed or the CA warned.
 * Traders and medium enterprises are outside the rule, so bills are included only when the vendor is marked micro or small.
 */
export function msmePayables(items: MsmePayableInput[], now: Date, yearEnd: Date): { rows: MsmePayable[]; unpaidPastDue: number; unpaidPastDueAmount: number; paidLate: number } {
  const rows: MsmePayable[] = [];
  for (const it of items) {
    if (!isMicroOrSmall(it.vendorMsme)) continue;
    const due = new Date(it.date.getTime() + allowedDays(it.agreedDays) * DAY);
    const ref = it.paid ? (it.paidAt ?? it.date) : now;
    const lateDays = Math.floor((ref.getTime() - due.getTime()) / DAY);
    let state: MsmePayable["state"] = "OK";
    if (it.paid) state = lateDays > 0 ? "PAID_LATE" : "OK";
    else if (lateDays > 0) state = "OVERDUE_UNPAID";
    else if (due.getTime() - now.getTime() <= 7 * DAY) state = "DUE_SOON";
    // Bills dated after the year end belong to the next year.
    if (it.date.getTime() > yearEnd.getTime()) continue;
    rows.push({ id: it.id, vendor: it.vendor, amount: it.amount, dueDate: due.toISOString().slice(0, 10), daysOverdue: Math.max(0, lateDays), state });
  }
  const unpaid = rows.filter((r) => r.state === "OVERDUE_UNPAID");
  return { rows, unpaidPastDue: unpaid.length, unpaidPastDueAmount: Math.round(unpaid.reduce((s, r) => s + r.amount, 0) * 100) / 100, paidLate: rows.filter((r) => r.state === "PAID_LATE").length };
}
