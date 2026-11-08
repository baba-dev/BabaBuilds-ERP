import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { checkPermissionSilent } from "@/lib/rbac";
import { invoiceGstSelect, loadGstProfile, toInvoiceInput } from "@/lib/gst/data";
import { classifyInvoice } from "@/lib/gst/classify";
import { eInvoiceStatus, isValidIrn } from "@/lib/gst/einvoice";
import { needsEway } from "@/lib/gst/eway";
import { FOREIGN_POS, isStateCode } from "@/lib/gst/states";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";

/** The GST view of one invoice: how it is classified, how tax splits, and its e-invoice status. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const row = await prisma.invoice.findFirst({ where: { id, workspaceId: auth.access.workspaceId }, select: invoiceGstSelect });
  if (!row) return gstError(404, "NOT_FOUND", "Invoice not found.");
  const profile = await loadGstProfile(auth.access.workspaceId);
  const c = classifyInvoice(toInvoiceInput(row), profile.stateCode);
  const ei = eInvoiceStatus({ prevTurnover: profile.prevTurnover, invoiceDate: c.date, supplyType: c.supplyType, irn: row.irn });
  const canEdit = await checkPermissionSilent(auth.access.userId, auth.access.workspaceId, "tax.manage");
  const sum = (k: "igst" | "cgst" | "sgst" | "cess") => Math.round(c.lines.reduce((s, l) => s + l[k], 0) * 100) / 100;
  return NextResponse.json({
    applicable: profile.countryCode === "IN" && profile.registrationType !== "UNREGISTERED",
    supplyType: c.supplyType, placeOfSupply: c.placeOfSupply, interState: c.interState, taxable: c.taxable, tax: c.tax,
    split: { igst: sum("igst"), cgst: sum("cgst"), sgst: sum("sgst"), cess: sum("cess") }, issues: c.issues,
    overrides: { placeOfSupply: row.gstPlaceOfSupply, reverseCharge: row.gstReverseCharge, supplyOverride: row.gstSupplyOverride, ecoGstin: row.gstEcoGstin },
    einvoice: { status: ei.status, dueBy: ei.dueBy?.toISOString() ?? null, daysLeft: ei.daysLeft, irn: row.irn, ackNo: row.irnAckNo, ackDate: row.irnAckDate?.toISOString().slice(0, 10) ?? null },
    eway: { needed: needsEway(c), number: row.ewayBillNo },
    voided: row.status === "VOID",
    canEdit,
  });
}

const patchSchema = z.object({
  placeOfSupply: z.string().nullable().optional().refine((v) => v === undefined || v === null || v === "" || v === FOREIGN_POS || isStateCode(v), "Unknown place of supply"),
  reverseCharge: z.boolean().optional(),
  supplyOverride: z.enum(["SEZ_WP", "SEZ_WOP"]).nullable().optional(),
  ecoGstin: z.string().trim().max(20).nullable().optional().refine((v) => !v || validateGstin(v).valid, "The e-commerce operator GSTIN is not valid"),
  irn: z.string().trim().toLowerCase().nullable().optional().refine((v) => !v || isValidIrn(v), "An IRN is 64 hexadecimal characters"),
  irnAckNo: z.string().trim().max(30).nullable().optional(),
  irnAckDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ewayBillNo: z.string().trim().max(20).nullable().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", body.error.issues[0]?.message ?? "Check the GST details.");
  const b = body.data;
  const data: Record<string, unknown> = {};
  if (b.placeOfSupply !== undefined) data.gstPlaceOfSupply = b.placeOfSupply || null;
  if (b.reverseCharge !== undefined) data.gstReverseCharge = b.reverseCharge;
  if (b.supplyOverride !== undefined) data.gstSupplyOverride = b.supplyOverride;
  if (b.ecoGstin !== undefined) data.gstEcoGstin = b.ecoGstin ? normalizeGstin(b.ecoGstin) : null;
  if (b.irn !== undefined) data.irn = b.irn || null;
  if (b.irnAckNo !== undefined) data.irnAckNo = b.irnAckNo || null;
  if (b.irnAckDate !== undefined) data.irnAckDate = b.irnAckDate ? new Date(`${b.irnAckDate}T00:00:00.000Z`) : null;
  if (b.ewayBillNo !== undefined) data.ewayBillNo = b.ewayBillNo || null;
  const res = await prisma.invoice.updateMany({ where: { id, workspaceId: auth.access.workspaceId }, data });
  if (res.count === 0) return gstError(404, "NOT_FOUND", "Invoice not found.");
  await auditGst(auth.access, "INVOICE_GST_UPDATED", { type: "Invoice", id }, { fields: Object.keys(data) }, request);
  return NextResponse.json({ ok: true });
}

