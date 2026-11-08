import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { dateOnly, itemSchema } from "@/lib/ca/schemas";

/**
 * Record what happened to one obligation: status, who owns it, filing reference, notes, an extended due date.
 * GST returns take their status from the GST workspace, so only owner and notes can be set on them here.
 * Changing the outcome of a signed-off item clears the sign-off: a CA signs what they saw.
 */
export async function PUT(request: Request) {
  const auth = await requireCaAccess("ca.manage");
  if (!auth.ok) return auth.response;
  const parsed = itemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return caError(400, "INVALID_BODY", parsed.error.issues[0]?.message ?? "Check the item.");
  const b = parsed.data;
  const { workspaceId } = auth.access;
  const isGst = b.kind.startsWith("GST_");
  if (isGst && (b.status !== undefined || b.filedAt !== undefined || b.reference !== undefined || b.dueOverride !== undefined)) {
    return caError(409, "STATUS_LOCKED", "GST returns are filed and tracked in the GST workspace.");
  }
  if (b.ownerUserId) {
    const member = await prisma.workspaceUser.findFirst({ where: { workspaceId, userId: b.ownerUserId, isActive: true }, select: { id: true } });
    if (!member) return caError(422, "OWNER_NOT_FOUND", "That person is not an active member of this workspace.");
  }

  const existing = await prisma.caComplianceItem.findUnique({ where: { workspaceId_kind_periodKey: { workspaceId, kind: b.kind, periodKey: b.periodKey } } });
  const data: Record<string, unknown> = {};
  if (b.status !== undefined) {
    data.status = b.status;
    if (b.status === "FILED") data.filedAt = b.filedAt ? dateOnly(b.filedAt) : existing?.filedAt ?? new Date();
    else if (b.filedAt === undefined) data.filedAt = null;
  }
  if (b.filedAt !== undefined && b.status !== "FILED") data.filedAt = b.filedAt ? dateOnly(b.filedAt) : null;
  if (b.ownerUserId !== undefined) data.ownerUserId = b.ownerUserId;
  if (b.reference !== undefined) data.reference = b.reference || null;
  if (b.notes !== undefined) data.notes = b.notes || null;
  if (b.dueOverride !== undefined) data.dueOverride = b.dueOverride ? dateOnly(b.dueOverride) : null;

  const outcomeChanged = existing?.signedOffAt && (b.status !== undefined && b.status !== existing.status || b.reference !== undefined && (b.reference || null) !== existing.reference || b.filedAt !== undefined);
  if (outcomeChanged) Object.assign(data, { signedOffAt: null, signedOffByUserId: null, signedOffByName: null });

  const row = await prisma.caComplianceItem.upsert({
    where: { workspaceId_kind_periodKey: { workspaceId, kind: b.kind, periodKey: b.periodKey } },
    create: { workspaceId, kind: b.kind, periodKey: b.periodKey, fy: b.fy, ...data },
    update: data,
  });
  await auditCa(auth.access, "ITEM_UPDATED", { type: "CaComplianceItem", id: row.id }, { kind: b.kind, periodKey: b.periodKey, fields: Object.keys(data), signOffCleared: !!outcomeChanged }, request);
  return NextResponse.json({ ok: true, signOffCleared: !!outcomeChanged });
}
