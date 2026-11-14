import { NextResponse } from "next/server";
import { z } from "zod";
import { reconError, requireReconAccess } from "@/lib/reconciliation/access";
import { unmatchBankTransaction } from "@/lib/reconciliation/workspace";

/** Undo a match: gives the money back to the invoice, removes an expense the match created, reopens a bill it paid. */
export async function POST(request: Request) {
  const auth = await requireReconAccess("reconciliation.commit");
  if (!auth.ok) return auth.response;
  const parsed = z.object({ bankTransactionId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reconError(400, "INVALID_BODY", "Choose a bank line.");
  const r = await unmatchBankTransaction(auth.ctx, parsed.data.bankTransactionId);
  return r.ok ? NextResponse.json({ success: true, reversedInvoices: r.reversedInvoices, removedExpense: r.removedExpense, reopenedBill: r.reopenedBill }) : reconError(r.status, r.code, r.message);
}
