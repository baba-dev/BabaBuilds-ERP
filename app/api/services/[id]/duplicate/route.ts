import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { requireServiceAccess, serviceError } from "@/lib/services/access";
import { sameServiceName } from "@/lib/services/validation";
import { SERVICE_INCLUDE, withUsage } from "@/lib/services/serialize";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireServiceAccess("write");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId, email } = auth.access;
    const { id } = await context.params;

    const source = await prisma.serviceTemplate.findFirst({ where: { id, workspaceId } });
    if (!source) return serviceError(404, "SERVICE_NOT_FOUND", "Service not found or unauthorized.");

    const siblings = await prisma.serviceTemplate.findMany({ where: { workspaceId, name: { startsWith: source.name } }, select: { name: true } });
    let name = `${source.name} (copy)`;
    for (let n = 2; siblings.some((s) => sameServiceName(s.name, name)); n += 1) name = `${source.name} (copy ${n})`;
    name = name.slice(0, 120);

    const created = await prisma.serviceTemplate.create({
      data: {
        workspaceId,
        name,
        description: source.description,
        longDescription: source.longDescription,
        defaultPrice: source.defaultPrice,
        imageUrl: source.imageUrl,
        nicCodeId: source.nicCodeId,
        sacCodeId: source.sacCodeId,
      },
      include: SERVICE_INCLUDE,
    });

    logActivity({
      action: "service.duplicate",
      outcome: "success",
      entityType: "serviceTemplate",
      entityId: created.id,
      workspaceId,
      actorId: userId,
      actorEmail: email,
      metadata: { from: source.id, name },
    });

    return NextResponse.json({ success: true, service: withUsage(created) }, { status: 201 });
  } catch (error) {
    console.error("Service duplicate error:", error);
    return serviceError(500, "SERVICE_DUPLICATE_FAILED", "Failed to duplicate service");
  }
}
