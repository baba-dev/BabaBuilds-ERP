import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { addRetainerEvent } from "@/lib/retainers/events";
import { usageInputSchema } from "@/lib/retainers/validation";
import { afterRetainerChange } from "@/lib/retainers/save";

/** Adds metered usage that is billed on the retainer's next invoice. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const { id } = await params;
  const parsed = usageInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return retainerError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid usage.");
  const r = await prisma.retainer.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!r) return retainerError(404, "RETAINER_NOT_FOUND", "Retainer not found.");
  if (r.status === "CANCELLED" || r.status === "COMPLETED") return retainerError(409, "RETAINER_LOCKED", "Usage can't be added to a finished retainer.");
  const usage = await prisma.meteredUsage.create({ data: { retainerId: id, description: parsed.data.description, quantity: parsed.data.quantity, unitPrice: parsed.data.unitPrice } });
  await addRetainerEvent(prisma, { workspaceId, retainerId: id, type: "USAGE_ADDED", message: parsed.data.description, actorUserId: userId });
  afterRetainerChange(workspaceId, "usage");
  return NextResponse.json({ success: true, usage: { id: usage.id } });
}
