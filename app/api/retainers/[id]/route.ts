import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { detailInclude, serializeDetail } from "@/lib/retainers/serialize";
import { retainerInputSchema } from "@/lib/retainers/validation";
import { priceRetainer } from "@/lib/retainers/pricing";
import { afterRetainerChange, resolveCurrency, updateRetainer } from "@/lib/retainers/save";
import { canHardDelete } from "@/lib/retainers/status";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireRetainerAccess("retainers.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = await prisma.retainer.findFirst({ where: { id, workspaceId: auth.access.workspaceId }, include: detailInclude });
  if (!row) return retainerError(404, "RETAINER_NOT_FOUND", "Retainer not found.");
  return NextResponse.json({ data: serializeDetail(row) });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;
  const { id } = await params;
  const parsed = retainerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return retainerError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid retainer.", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const input = parsed.data;
  if (input.endDate && Date.parse(input.endDate) < Date.parse(input.nextBillingDate)) {
    return retainerError(400, "VALIDATION_ERROR", "The end date must be after the next billing date.");
  }
  const existing = await prisma.retainer.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!existing) return retainerError(404, "RETAINER_NOT_FOUND", "Retainer not found.");
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    return retainerError(409, "RETAINER_LOCKED", "A cancelled or completed retainer can't be edited. Create a new one instead.");
  }
  try {
    const priced = await priceRetainer(workspaceId, input);
    if (!priced.ok) return retainerError(priced.status, priced.code, priced.message, priced.details);
    const { currency, exchangeRate } = await resolveCurrency(workspaceId, input);
    const updated = await updateRetainer({ workspaceId, retainerId: id, actorUserId: userId, input, pricing: priced.pricing, currency, exchangeRate });
    if (!updated) return retainerError(409, "RETAINER_LOCKED", "This retainer changed while you were editing it.");
    logActivity({ action: "retainer_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "retainer", id }, request });
    afterRetainerChange(workspaceId, "update");
    return NextResponse.json({ success: true, retainer: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("Retainer update error:", error);
    return retainerError(500, "RETAINER_UPDATE_FAILED", "Failed to update the retainer.");
  }
}

/** Only a retainer that never produced an invoice is deleted; everything else is cancelled to keep its history. */
export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;
  const { id } = await params;
  const row = await prisma.retainer.findFirst({ where: { id, workspaceId }, select: { cyclesBilled: true, _count: { select: { invoices: true } } } });
  if (!row) return retainerError(404, "RETAINER_NOT_FOUND", "Retainer not found.");
  if (!canHardDelete(row.cyclesBilled, row._count.invoices)) {
    return retainerError(409, "RETAINER_NOT_DELETABLE", "This retainer has billed invoices, so it can only be cancelled.", { cancellable: true });
  }
  const res = await prisma.retainer.deleteMany({ where: { id, workspaceId, cyclesBilled: 0 } });
  if (res.count === 0) return retainerError(409, "RETAINER_NOT_DELETABLE", "This retainer changed while deleting. Refresh and try again.", { cancellable: true });
  logActivity({ action: "retainer_deleted", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "retainer", id }, request });
  afterRetainerChange(workspaceId, "delete");
  return NextResponse.json({ success: true });
}
