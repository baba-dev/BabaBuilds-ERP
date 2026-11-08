import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { getGstr9 } from "@/lib/gst/service";
import { fyLabel, fyStartYear, parseFyLabel } from "@/lib/gst/calendar";
import { GSTR9_MANUAL_ROWS } from "@/lib/gst/gstr9";

function fyFrom(request: Request) {
  const p = new URL(request.url).searchParams.get("fy");
  return p ? parseFyLabel(p) : fyStartYear(new Date()) - 1;
}

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const fy = fyFrom(request);
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2025-26.");
  try {
    const { report, inputs, filing, drift, profile } = await getGstr9(auth.access.workspaceId, fy);
    return NextResponse.json({ report, inputs, filing, drift, manualRows: GSTR9_MANUAL_ROWS, gstin: profile.gstin, registrationType: profile.registrationType });
  } catch (error) {
    console.error("GSTR-9 error:", error);
    return gstError(500, "GSTR9_FAILED", "Failed to prepare GSTR-9.");
  }
}

const amount = z.number().finite().min(-1e12).max(1e12).optional();
const rowSchema = z.object({ taxable: amount, igst: amount, cgst: amount, sgst: amount, cess: amount }).strict();
const inputsSchema = z
  .object({
    fy: z.string(),
    lateFeePaid: z.number().min(0).max(1e8).optional(),
    interestPaid: z.number().min(0).max(1e9).optional(),
    rows: z.record(z.string(), rowSchema).optional(),
    c9Items: z.array(z.object({ label: z.string().trim().min(1).max(80), amount: z.number().finite().min(-1e12).max(1e12) })).max(30).optional(),
  })
  .strict();

/** Save the manually keyed GSTR-9 rows (tables 4F, 8C/8E, 10-16, 19) and 9C reconciling items. Only the sent parts change. */
export async function PUT(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const body = inputsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the figures and try again.");
  const fy = parseFyLabel(body.data.fy);
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2025-26.");
  const allowed = new Set<string>(GSTR9_MANUAL_ROWS.map((r) => r.key));
  const workspaceId = auth.access.workspaceId;
  const existing = await prisma.gstReturn.findUnique({ where: { workspaceId_returnType_periodKey: { workspaceId, returnType: "GSTR9", periodKey: fyLabel(fy) } }, select: { inputsJson: true } });
  const merged: Record<string, unknown> = { ...((existing?.inputsJson as Record<string, unknown> | null) ?? {}) };
  if (body.data.rows) {
    for (const key of Object.keys(merged)) if (allowed.has(key)) delete merged[key];
    for (const [k2, v] of Object.entries(body.data.rows)) if (allowed.has(k2)) merged[k2] = v;
  }
  if (body.data.lateFeePaid !== undefined) merged.lateFeePaid = body.data.lateFeePaid;
  if (body.data.interestPaid !== undefined) merged.interestPaid = body.data.interestPaid;
  if (body.data.c9Items !== undefined) merged.c9Items = body.data.c9Items;
  const inputsJson = merged;
  await prisma.gstReturn.upsert({
    where: { workspaceId_returnType_periodKey: { workspaceId, returnType: "GSTR9", periodKey: fyLabel(fy) } },
    create: { workspaceId, returnType: "GSTR9", periodKey: fyLabel(fy), inputsJson: inputsJson as object },
    update: { inputsJson: inputsJson as object },
  });
  await auditGst(auth.access, "GSTR9_INPUTS_SAVED", { type: "GstReturn", id: `GSTR9:${fyLabel(fy)}` }, undefined, request);
  return NextResponse.json({ ok: true });
}
