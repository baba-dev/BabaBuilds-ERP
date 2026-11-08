import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { afterRetainerChange } from "@/lib/retainers/save";

/** Removes a price change that has not been applied yet. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.access;
  const { id, changeId } = await params;
  const res = await prisma.retainerPriceChange.deleteMany({ where: { id: changeId, retainerId: id, appliedAt: null, retainer: { workspaceId } } });
  if (res.count === 0) return retainerError(404, "CHANGE_NOT_FOUND", "Pending price change not found.");
  afterRetainerChange(workspaceId, "price-change");
  return NextResponse.json({ success: true });
}
