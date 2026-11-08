import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { num } from "@/lib/gst/money";
import { ADJUSTMENT_KINDS } from "@/lib/gst/adjustment-kinds";


const head = z.number().finite().min(0).max(1e10).default(0);
const schema = z.object({
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-04"),
  kind: z.enum(ADJUSTMENT_KINDS),
  igst: head, cgst: head, sgst: head, cess: head,
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function GET() {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const rows = await prisma.gstAdjustment.findMany({ where: { workspaceId: auth.access.workspaceId }, orderBy: [{ periodKey: "desc" }, { createdAt: "desc" }], take: 200 });
  return NextResponse.json({
    adjustments: rows.map((r) => ({ id: r.id, periodKey: r.periodKey, kind: r.kind, igst: num(r.igst), cgst: num(r.cgst), sgst: num(r.sgst), cess: num(r.cess), notes: r.notes, createdAt: r.createdAt.toISOString() })),
  });
}

export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", body.error.issues[0]?.message ?? "Check the figures and try again.");
  const d = body.data;
  if (d.igst + d.cgst + d.sgst + d.cess <= 0) return gstError(400, "AMOUNT_REQUIRED", "Enter an amount for at least one tax head.");
  const row = await prisma.gstAdjustment.create({ data: { workspaceId: auth.access.workspaceId, periodKey: d.periodKey, kind: d.kind, igst: d.igst, cgst: d.cgst, sgst: d.sgst, cess: d.cess, notes: d.notes ?? null, createdByUserId: auth.access.userId } });
  return NextResponse.json({ id: row.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return gstError(400, "ID_REQUIRED", "Missing adjustment id.");
  const res = await prisma.gstAdjustment.deleteMany({ where: { id, workspaceId: auth.access.workspaceId } });
  if (res.count === 0) return gstError(404, "NOT_FOUND", "Adjustment not found.");
  return NextResponse.json({ ok: true });
}
