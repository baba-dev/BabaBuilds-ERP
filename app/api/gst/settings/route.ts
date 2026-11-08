import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { loadGstProfile } from "@/lib/gst/data";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { isStateCode } from "@/lib/gst/states";

export async function GET() {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const p = await loadGstProfile(auth.access.workspaceId);
  return NextResponse.json({
    gstin: p.gstin, gstinValid: p.gstinValid, stateCode: p.stateCode, registrationType: p.registrationType, filingFrequency: p.filingFrequency,
    remindersEnabled: p.remindersEnabled, prevTurnover: p.prevTurnover, registeredFrom: p.registeredFrom?.toISOString().slice(0, 10) ?? null, lutActive: p.lutActive, hasProfile: p.hasProfile, companyName: p.companyName, countryCode: p.countryCode,
  });
}

const schema = z.object({
  gstin: z.string().trim().max(20).optional().nullable(),
  stateCode: z.string().trim().optional().nullable(),
  registrationType: z.enum(["REGULAR", "COMPOSITION", "UNREGISTERED"]).optional(),
  filingFrequency: z.enum(["MONTHLY", "QRMP"]).optional(),
  prevTurnover: z.number().finite().min(0).max(1e13).optional().nullable(),
  registeredFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  lutActive: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the GST settings and try again.");
  const d = body.data;
  const workspaceId = auth.access.workspaceId;
  const existing = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { id: true } });
  if (!existing) return gstError(409, "PROFILE_REQUIRED", "Complete your business profile in Settings first.");

  const data: Record<string, unknown> = {};
  if (d.gstin !== undefined) {
    const g = normalizeGstin(d.gstin);
    if (g) {
      const check = validateGstin(g);
      if (!check.valid) return gstError(400, "GSTIN_INVALID", "That GSTIN is not valid. Check the 15 characters.", { reason: check.reason });
      data.gstin = g;
      data.gstStateCode = check.stateCode;
    } else data.gstin = null;
  }
  if (d.stateCode !== undefined && !data.gstStateCode) {
    if (d.stateCode && !isStateCode(d.stateCode)) return gstError(400, "STATE_INVALID", "Unknown state code.");
    data.gstStateCode = d.stateCode || null;
  }
  if (d.registrationType) data.gstRegistrationType = d.registrationType;
  if (d.filingFrequency) data.gstFilingFrequency = d.filingFrequency;
  if (d.prevTurnover !== undefined) data.gstPrevFyTurnover = d.prevTurnover;
  if (d.registeredFrom !== undefined) data.gstRegisteredFrom = d.registeredFrom ? new Date(d.registeredFrom) : null;
  if (d.lutActive !== undefined) data.gstLutActive = d.lutActive;
  if (d.remindersEnabled !== undefined) data.gstRemindersEnabled = d.remindersEnabled;
  await prisma.businessProfile.update({ where: { workspaceId }, data });
  await auditGst(auth.access, "SETTINGS_UPDATED", { type: "BusinessProfile", id: workspaceId }, { fields: Object.keys(data) }, request);
  return NextResponse.json({ ok: true });
}
