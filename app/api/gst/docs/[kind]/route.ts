import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { loadGstProfile } from "@/lib/gst/data";
import { advanceAdjustSchema, advanceSchema, amendmentSchema, debitNoteSchema, splitAdvance, splitTax } from "@/lib/gst/docs";
import { num } from "@/lib/gst/money";

const KINDS = ["debit-notes", "amendments", "advances"] as const;
type Kind = (typeof KINDS)[number];

async function kindOf(params: Promise<{ kind: string }>): Promise<Kind | null> {
  const { kind } = await params;
  return (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : null;
}

const d = (v: string) => new Date(`${v}T00:00:00.000Z`);
const iso = (v: Date | null) => v?.toISOString().slice(0, 10) ?? null;

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const kind = await kindOf(ctx.params);
  if (!kind) return gstError(404, "UNKNOWN_KIND", "Unknown document type.");
  const workspaceId = auth.access.workspaceId;
  if (kind === "debit-notes") {
    const rows = await prisma.gstDebitNote.findMany({ where: { workspaceId }, orderBy: { issuedAt: "desc" }, take: 200 });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, number: r.noteNumber, date: iso(r.issuedAt), invoiceNumber: r.invoiceNumber, party: r.recipientName, gstin: r.recipientGstin, pos: r.pos, rate: r.rate, taxable: num(r.taxable), tax: num(r.igst) + num(r.cgst) + num(r.sgst) + num(r.cess), reason: r.reason })) });
  }
  if (kind === "amendments") {
    const rows = await prisma.gstAmendment.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, periodKey: r.periodKey, originalPeriodKey: r.originalPeriodKey, number: r.originalNumber, date: iso(r.originalDate), party: r.recipientName, gstin: r.recipientGstin, pos: r.pos, rate: r.rate, originalTaxable: num(r.originalTaxable), revisedTaxable: num(r.revisedTaxable), delta: num(r.revisedTaxable) - num(r.originalTaxable), reason: r.reason })) });
  }
  const rows = await prisma.gstAdvance.findMany({ where: { workspaceId }, orderBy: { receivedAt: "desc" }, take: 200 });
  return NextResponse.json({ items: rows.map((r) => ({ id: r.id, date: iso(r.receivedAt), party: r.party, gstin: r.recipientGstin, pos: r.pos, rate: r.rate, amount: num(r.amount), taxable: num(r.taxable), tax: num(r.igst) + num(r.cgst) + num(r.sgst), adjustedAt: iso(r.adjustedAt), adjustedInvoice: r.adjustedInvoice, notes: r.notes })) });
}

export async function POST(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const kind = await kindOf(ctx.params);
  if (!kind) return gstError(404, "UNKNOWN_KIND", "Unknown document type.");
  const body = await request.json().catch(() => null);
  const { workspaceId, userId } = auth.access;
  const profile = await loadGstProfile(workspaceId);
  const supplier = profile.stateCode;

  try {
    if (kind === "debit-notes") {
      const p = debitNoteSchema.safeParse(body);
      if (!p.success) return gstError(400, "INVALID_BODY", p.error.issues[0]?.message ?? "Check the debit note.");
      const x = p.data;
      const tax = splitTax(x.taxable, x.rate, x.pos, supplier);
      const row = await prisma.gstDebitNote.create({ data: { workspaceId, noteNumber: x.noteNumber, issuedAt: d(x.issuedAt), invoiceNumber: x.invoiceNumber ?? null, invoiceDate: x.invoiceDate ? d(x.invoiceDate) : null, recipientName: x.recipientName, recipientGstin: x.recipientGstin, pos: x.pos, rate: x.rate, taxable: x.taxable, ...tax, reason: x.reason, createdByUserId: userId } });
      await auditGst(auth.access, "DEBIT_NOTE_CREATED", { type: "GstDebitNote", id: row.id }, { number: x.noteNumber }, request);
      return NextResponse.json({ id: row.id }, { status: 201 });
    }
    if (kind === "amendments") {
      const p = amendmentSchema.safeParse(body);
      if (!p.success) return gstError(400, "INVALID_BODY", p.error.issues[0]?.message ?? "Check the amendment.");
      const x = p.data;
      const o = splitTax(x.originalTaxable, x.rate, x.pos, supplier);
      const r = splitTax(x.revisedTaxable, x.rate, x.pos, supplier);
      const row = await prisma.gstAmendment.create({ data: { workspaceId, periodKey: x.periodKey, originalPeriodKey: x.originalPeriodKey, originalNumber: x.originalNumber, originalDate: d(x.originalDate), recipientName: x.recipientName ?? null, recipientGstin: x.recipientGstin, pos: x.pos, rate: x.rate, originalTaxable: x.originalTaxable, originalIgst: o.igst, originalCgst: o.cgst, originalSgst: o.sgst, revisedTaxable: x.revisedTaxable, revisedIgst: r.igst, revisedCgst: r.cgst, revisedSgst: r.sgst, reason: x.reason, createdByUserId: userId } });
      await auditGst(auth.access, "AMENDMENT_CREATED", { type: "GstAmendment", id: row.id }, { number: x.originalNumber, period: x.periodKey }, request);
      return NextResponse.json({ id: row.id }, { status: 201 });
    }
    const p = advanceSchema.safeParse(body);
    if (!p.success) return gstError(400, "INVALID_BODY", p.error.issues[0]?.message ?? "Check the advance.");
    const x = p.data;
    const s = splitAdvance(x.amount, x.rate, x.pos, supplier);
    const row = await prisma.gstAdvance.create({ data: { workspaceId, receivedAt: d(x.receivedAt), party: x.party, recipientGstin: x.recipientGstin, pos: x.pos, rate: x.rate, amount: x.amount, ...s, notes: x.notes ?? null, createdByUserId: userId } });
    await auditGst(auth.access, "ADVANCE_CREATED", { type: "GstAdvance", id: row.id }, { amount: x.amount }, request);
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return gstError(409, "DUPLICATE", "That number already exists.");
    console.error("GST docs create error:", error);
    return gstError(500, "CREATE_FAILED", "Could not save that.");
  }
}

const adjustBody = z.object({ id: z.string().min(1) }).merge(advanceAdjustSchema);

/** Mark an advance as adjusted against an invoice. */
export async function PATCH(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const kind = await kindOf(ctx.params);
  if (kind !== "advances") return gstError(404, "UNKNOWN_KIND", "Only advances can be adjusted.");
  const p = adjustBody.safeParse(await request.json().catch(() => null));
  if (!p.success) return gstError(400, "INVALID_BODY", p.error.issues[0]?.message ?? "Check the details.");
  const res = await prisma.gstAdvance.updateMany({ where: { id: p.data.id, workspaceId: auth.access.workspaceId }, data: { adjustedAt: d(p.data.adjustedAt), adjustedInvoice: p.data.adjustedInvoice } });
  if (res.count === 0) return gstError(404, "NOT_FOUND", "Advance not found.");
  await auditGst(auth.access, "ADVANCE_ADJUSTED", { type: "GstAdvance", id: p.data.id }, { invoice: p.data.adjustedInvoice }, request);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const kind = await kindOf(ctx.params);
  if (!kind) return gstError(404, "UNKNOWN_KIND", "Unknown document type.");
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return gstError(400, "ID_REQUIRED", "Missing id.");
  const where = { id, workspaceId: auth.access.workspaceId };
  const res = kind === "debit-notes" ? await prisma.gstDebitNote.deleteMany({ where }) : kind === "amendments" ? await prisma.gstAmendment.deleteMany({ where }) : await prisma.gstAdvance.deleteMany({ where });
  if (res.count === 0) return gstError(404, "NOT_FOUND", "Not found.");
  await auditGst(auth.access, "DOC_DELETED", { type: kind, id }, undefined, request);
  return NextResponse.json({ ok: true });
}
