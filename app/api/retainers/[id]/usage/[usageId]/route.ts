import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { addRetainerEvent } from "@/lib/retainers/events";
import { afterRetainerChange } from "@/lib/retainers/save";

/** Removes usage that has not been billed yet. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; usageId: string }> }) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const { id, usageId } = await params;
  const res = await prisma.meteredUsage.deleteMany({ where: { id: usageId, retainerId: id, status: "PENDING", retainer: { workspaceId } } });
  if (res.count === 0) return retainerError(404, "USAGE_NOT_FOUND", "Pending usage not found.");
  await addRetainerEvent(prisma, { workspaceId, retainerId: id, type: "USAGE_REMOVED", actorUserId: userId });
  afterRetainerChange(workspaceId, "usage");
  return NextResponse.json({ success: true });
}
