import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { getCaOverview } from "@/lib/ca/data";
import { parseAnyFy } from "@/lib/ca/fy";
import { signoffSchema } from "@/lib/ca/schemas";

/**
 * A CA (or the owner) signs off an obligation that has been filed, or the year once nothing blocks closing the books.
 * Signing is refused when the evidence is not there, so a sign-off always means something.
 */
export async function POST(request: Request) {
  const auth = await requireCaAccess("ca.signoff");
  if (!auth.ok) return auth.response;
  const parsed = signoffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return caError(400, "INVALID_BODY", "Check the item to sign off.");
  const b = parsed.data;
  const { workspaceId, userId, name } = auth.access;
  const key = { workspaceId_kind_periodKey: { workspaceId, kind: b.kind, periodKey: b.periodKey } };

  if (b.undo) {
    const res = await prisma.caComplianceItem.updateMany({ where: { workspaceId, kind: b.kind, periodKey: b.periodKey }, data: { signedOffAt: null, signedOffByUserId: null, signedOffByName: null } });
    if (res.count > 0) await auditCa(auth.access, "SIGNOFF_REMOVED", { type: "CaComplianceItem", id: `${b.kind}:${b.periodKey}` }, { kind: b.kind, periodKey: b.periodKey }, request);
    return NextResponse.json({ ok: true });
  }

  const start = parseAnyFy(b.fy);
  if (start === null) return caError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  const overview = await getCaOverview(workspaceId, start);
  const item = overview.items.find((i) => i.kind === b.kind && i.periodKey === b.periodKey);
  if (!item) return caError(404, "NOT_FOUND", "That obligation is not on the calendar for this year.");

  if (b.kind === "YEAR_CLOSE") {
    if (!overview.readiness.readyToClose) return caError(409, "NOT_READY", "Resolve the blockers before signing off the year.", { blockers: overview.readiness.blockers });
    const overdue = overview.items.filter((i) => i.state === "OVERDUE" && i.kind !== "YEAR_CLOSE").length;
    if (overdue > 0) return caError(409, "OVERDUE_OPEN", "Some obligations are overdue and not filed.", { overdue });
  } else if (item.state !== "FILED") {
    return caError(409, "NOT_FILED", "Only a filed obligation can be signed off.");
  }

  await prisma.caComplianceItem.upsert({
    where: key,
    create: { workspaceId, kind: b.kind, periodKey: b.periodKey, fy: b.fy, signedOffAt: new Date(), signedOffByUserId: userId, signedOffByName: name },
    update: { signedOffAt: new Date(), signedOffByUserId: userId, signedOffByName: name },
  });
  await auditCa(auth.access, "SIGNED_OFF", { type: "CaComplianceItem", id: `${b.kind}:${b.periodKey}` }, { kind: b.kind, periodKey: b.periodKey, fy: b.fy }, request);
  return NextResponse.json({ ok: true });
}
