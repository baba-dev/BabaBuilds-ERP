import type { Invoice } from "@prisma/client";

export type InvoiceMatchCandidate = {
  invoice: Invoice;
  score: number;
  reasons: string[];
};

const DAY_MS = 86_400_000;

function decimalEquals(a: unknown, b: unknown, tolerance = 0.02): boolean {
  const x = typeof a === "number" ? a : Number(a);
  const y = typeof b === "number" ? b : Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= tolerance;
}

function normalizeMoney(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function invoiceOutstanding(inv: Invoice): number {
  const billed = normalizeMoney(inv.grandTotal ?? inv.totalAmount ?? 0);
  const received = normalizeMoney(inv.amountReceived ?? 0);
  return Math.max(0, billed - received);
}

/**
 * Rank unpaid/partial invoices for an incoming bank credit line.
 */
export function rankInvoiceMatchesForCredit(args: {
  invoices: Invoice[];
  amount: number;
  bankDate: Date;
  narration: string;
  reference?: string | null;
  dateWindowDays?: number;
}): InvoiceMatchCandidate[] {
  const amount = normalizeMoney(args.amount);
  const haystack = `${args.narration} ${args.reference ?? ""}`.toUpperCase();
  const windowDays = args.dateWindowDays ?? 45;
  const windowMs = windowDays * DAY_MS;

  const candidates: InvoiceMatchCandidate[] = [];

  for (const inv of args.invoices) {
    if (inv.status !== "PENDING" && inv.status !== "PARTIALLY_PAID") continue;

    const outstanding = invoiceOutstanding(inv);
    if (outstanding <= 0) continue;

    let score = 0;
    const reasons: string[] = [];

    const amtMatch = decimalEquals(amount, outstanding);
    if (amtMatch) {
      score += 80;
      reasons.push("amount_matches_outstanding");
    } else if (decimalEquals(amount, normalizeMoney(inv.totalAmount))) {
      score += 55;
      reasons.push("amount_matches_invoice_total");
    } else if (Math.abs(amount - outstanding) <= 1) {
      score += 45;
      reasons.push("amount_near_outstanding");
    }

    const invNum = inv.invoiceNumber.trim().toUpperCase();
    if (invNum && haystack.includes(invNum)) {
      score += 60;
      reasons.push("invoice_number_in_narration");
    }

    const utrLike = /\b[A-Z0-9]{12,}\b/;
    const refChunk = (args.reference ?? "").toUpperCase();
    if (refChunk && invNum && refChunk.includes(invNum)) {
      score += 40;
      reasons.push("invoice_hint_in_reference");
    }

    const clientUpper = inv.clientName.trim().toUpperCase();
    if (clientUpper.length >= 4 && haystack.includes(clientUpper.slice(0, Math.min(12, clientUpper.length)))) {
      score += 25;
      reasons.push("client_name_in_narration");
    }

    const due = inv.dueDate ?? inv.expectedPaymentDate ?? inv.invoiceDate;
    const dueMs = new Date(due).getTime();
    const bankMs = args.bankDate.getTime();
    if (Number.isFinite(dueMs) && Number.isFinite(bankMs)) {
      const delta = Math.abs(bankMs - dueMs);
      if (delta <= windowMs) {
        score += 15;
        reasons.push("date_near_due_or_expected");
      }
    }

    if (utrLike.test(haystack) && amtMatch) {
      score += 5;
      reasons.push("bank_reference_present");
    }

    if (score <= 0) continue;

    candidates.push({ invoice: inv, score, reasons });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
