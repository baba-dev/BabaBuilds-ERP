import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaAccess } from "@/lib/ca/access";

/** Recent CA-related actions: who signed off, changed an item, exported evidence, raised a request. */
export async function GET() {
  const auth = await requireCaAccess("ca.view");
  if (!auth.ok) return auth.response;
  const rows = await prisma.appActivityLog.findMany({
    where: { workspaceId: auth.access.workspaceId, action: { startsWith: "CA_" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, actorEmail: true, actorUserId: true, entityType: true, entityId: true, metadata: true, createdAt: true },
  });
  return NextResponse.json({ activity: rows.map((r) => ({ id: r.id, action: r.action.replace(/^CA_/, ""), actor: r.actorEmail ?? r.actorUserId ?? "system", entityType: r.entityType, entityId: r.entityId, metadata: r.metadata, at: r.createdAt.toISOString() })) });
}
