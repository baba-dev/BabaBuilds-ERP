import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { loadCaSetup } from "@/lib/ca/data";
import { setupSchema } from "@/lib/ca/schemas";

export async function GET() {
  const auth = await requireCaAccess("ca.view");
  if (!auth.ok) return auth.response;
  const { setup, configured, panNumber } = await loadCaSetup(auth.access.workspaceId);
  return NextResponse.json({ setup, configured, panNumber });
}

/** The entity details the compliance calendar is built from. */
export async function PATCH(request: Request) {
  const auth = await requireCaAccess("ca.manage");
  if (!auth.ok) return auth.response;
  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return caError(400, "INVALID_BODY", parsed.error.issues[0]?.message ?? "Check the entity details.");
  const b = parsed.data;
  const res = await prisma.businessProfile.updateMany({
    where: { workspaceId: auth.access.workspaceId },
    data: {
      caEntityType: b.entityType,
      caTaxRegime: b.entityType === "PROPRIETOR" || b.entityType === "OTHER" ? b.taxRegime ?? "NEW" : null,
      // Presumptive schemes are for individuals and partnership firms only.
      caPresumptive: b.entityType === "PROPRIETOR" || b.entityType === "PARTNERSHIP" ? b.presumptive ?? "NONE" : "NONE",
      caTaxAuditApplicable: b.taxAuditApplicable ?? false,
      caTan: b.tan || null,
      caSetupAt: new Date(),
    },
  });
  if (res.count === 0) return caError(409, "PROFILE_MISSING", "Complete the business profile in Settings first.");
  await auditCa(auth.access, "SETUP_UPDATED", { type: "BusinessProfile", id: auth.access.workspaceId }, { entityType: b.entityType, presumptive: b.presumptive ?? "NONE", audit: b.taxAuditApplicable ?? false }, request);
  return NextResponse.json({ ok: true });
}
