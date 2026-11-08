import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { addRetainerEvent } from "@/lib/retainers/events";
import { priceChangeSchema } from "@/lib/retainers/validation";
import { afterRetainerChange } from "@/lib/retainers/save";

/** Schedules a percentage price change that is applied automatically on the first cycle on or after the date. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const { id } = await params;
  const parsed = priceChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return retainerError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid price change.");
  const r = await prisma.retainer.findFirst({ where: { id, workspaceId }, select: { status: true, _count: { select: { priceChanges: { where: { appliedAt: null } } } } } });
  if (!r) return retainerError(404, "RETAINER_NOT_FOUND", "Retainer not found.");
  if (r.status === "CANCELLED" || r.status === "COMPLETED") return retainerError(409, "RETAINER_LOCKED", "Price changes can't be scheduled on a finished retainer.");
  if (r._count.priceChanges >= 12) return retainerError(409, "TOO_MANY", "Remove a pending price change before adding another.");
  const change = await prisma.retainerPriceChange.create({ data: { workspaceId, retainerId: id, effectiveDate: new Date(parsed.data.effectiveDate), percent: parsed.data.percent, note: parsed.data.note } });
  await addRetainerEvent(prisma, { workspaceId, retainerId: id, type: "PRICE_SCHEDULED", message: `${parsed.data.percent > 0 ? "+" : ""}${parsed.data.percent}% from ${parsed.data.effectiveDate.slice(0, 10)}`, actorUserId: userId });
  afterRetainerChange(workspaceId, "price-change");
  return NextResponse.json({ success: true, priceChange: { id: change.id } });
}
