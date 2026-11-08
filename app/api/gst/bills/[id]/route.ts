import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { num, r2 } from "@/lib/gst/money";

const head = z.number().finite().min(0).max(1e12);
const schema = z.object({
  /** Hold the credit back (supplier has not filed) or release it. */
  itcHeld: z.boolean().optional(),
  /** Claim the credit in a later month than the bill's. null clears it. */
  itcClaimMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
  paymentStatus: z.enum(["PAID", "UNPAID"]).optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Take the supplier's figures from GSTR-2B for this bill. */
  acceptTwoB: z.object({ igst: head, cgst: head, sgst: head, cess: head, invoiceNumber: z.string().trim().max(60).optional() }).optional(),
});

/** Credit control on one purchase bill: hold, defer, mark paid (rule 37), or accept the GSTR-2B figures. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the values and try again.");
  const b = body.data;
  const bill = await prisma.expense.findFirst({ where: { id, workspaceId: auth.access.workspaceId }, select: { id: true, date: true, amount: true, itcStatus: true } });
  if (!bill) return gstError(404, "NOT_FOUND", "Bill not found.");
  const data: Record<string, unknown> = {};
  if (b.itcHeld !== undefined) data.itcHeld = b.itcHeld;
  if (b.itcClaimMonth !== undefined) {
    if (b.itcClaimMonth) {
      const billMonth = `${bill.date.getUTCFullYear()}-${String(bill.date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (b.itcClaimMonth < billMonth) return gstError(400, "CLAIM_BEFORE_BILL", "Credit cannot be claimed before the month of the bill.");
    }
    data.itcClaimMonth = b.itcClaimMonth;
  }
  if (b.paymentStatus !== undefined) {
    data.paymentStatus = b.paymentStatus;
    if (b.paymentStatus === "PAID" && b.paidAt === undefined) data.paidAt = new Date();
    if (b.paymentStatus === "UNPAID") data.paidAt = null;
  }
  if (b.paidAt !== undefined) data.paidAt = b.paidAt ? new Date(`${b.paidAt}T00:00:00.000Z`) : null;
  if (b.acceptTwoB) {
    const t = b.acceptTwoB;
    if (r2(t.igst + t.cgst + t.sgst + t.cess) > num(bill.amount)) return gstError(400, "TAX_EXCEEDS_AMOUNT", "The GSTR-2B tax is more than the bill amount.");
    if (bill.itcStatus === "NONE") return gstError(409, "NO_GST_ON_BILL", "This bill has no GST recorded.");
    Object.assign(data, { igstAmount: t.igst, cgstAmount: t.cgst, sgstAmount: t.sgst, cessAmount: t.cess });
    if (t.invoiceNumber) data.vendorInvoiceNo = t.invoiceNumber;
  }
  if (Object.keys(data).length === 0) return gstError(400, "NOTHING_TO_UPDATE", "Nothing to change.");
  await prisma.expense.update({ where: { id }, data });
  await auditGst(auth.access, "BILL_CREDIT_UPDATED", { type: "Expense", id }, { fields: Object.keys(data) }, request);
  return NextResponse.json({ ok: true });
}
