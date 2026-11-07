import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { parseServiceForm, sameServiceName } from "@/lib/services/validation";
import { saveServiceImage } from "@/lib/services/image-upload";
import { requireServiceAccess, serviceError } from "@/lib/services/access";
import { SERVICE_INCLUDE, withUsage } from "@/lib/services/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  try {
    const auth = await requireServiceAccess("write");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId, email } = auth.access;
    const { id } = await context.params;

    const existing = await prisma.serviceTemplate.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) return serviceError(404, "SERVICE_NOT_FOUND", "Service not found or unauthorized.");

    const formData = await request.formData();
    const parsed = parseServiceForm(formData);
    if (!parsed.success) return serviceError(400, "INVALID_SERVICE", parsed.error.issues[0]?.message ?? "Invalid service details.");
    const data = parsed.data;

    const [nic, sac, sameName] = await Promise.all([
      data.nicCodeId ? prisma.nICCode.findUnique({ where: { id: data.nicCodeId }, select: { id: true } }) : Promise.resolve(true),
      data.sacCodeId ? prisma.sACCode.findUnique({ where: { id: data.sacCodeId }, select: { id: true } }) : Promise.resolve(true),
      prisma.serviceTemplate.findMany({ where: { workspaceId, id: { not: id }, name: { contains: data.name } }, select: { name: true } }),
    ]);
    if (!nic || !sac) return serviceError(400, "INVALID_TAX_CODE", "The selected tax classification no longer exists.");
    if (sameName.some((s) => sameServiceName(s.name, data.name))) {
      return serviceError(409, "DUPLICATE_NAME", "Another service already uses this name.");
    }

    // The client sends the current image URL back; only trust our own storage prefix.
    const requested = formData.get("existingImageUrl");
    let imageUrl: string | null =
      typeof requested === "string" && requested.startsWith(`/uploads/service-hero/${workspaceId}/`) ? requested : null;

    const imageFile = formData.get("serviceImage");
    if (imageFile instanceof File && imageFile.size > 0) {
      const saved = await saveServiceImage(workspaceId, imageFile);
      if (!saved.ok) return serviceError(saved.status, saved.code, saved.message);
      imageUrl = saved.url;
    }

    const updated = await prisma.serviceTemplate.update({
      where: { id },
      data: { ...data, imageUrl },
      include: SERVICE_INCLUDE,
    });

    logActivity({
      action: "shop.service.update",
      outcome: "success",
      entityType: "serviceTemplate",
      entityId: updated.id,
      workspaceId,
      actorId: userId,
      actorEmail: email,
      metadata: { name: updated.name },
    });

    return NextResponse.json({ success: true, service: withUsage(updated) });
  } catch (error) {
    console.error("Service PATCH error:", error);
    return serviceError(500, "SERVICE_UPDATE_FAILED", "Failed to update service");
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const auth = await requireServiceAccess("write");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId, email } = auth.access;
    const { id } = await context.params;

    const existing = await prisma.serviceTemplate.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { proposalItems: true, retainerItems: true } } },
    });
    if (!existing) return serviceError(404, "SERVICE_NOT_FOUND", "Service not found or unauthorized.");

    // Related proposal/retainer lines keep their own copy of the text and price; the link is set to null.
    await prisma.serviceTemplate.delete({ where: { id } });

    logActivity({
      action: "shop.service.delete",
      outcome: "success",
      entityType: "serviceTemplate",
      entityId: id,
      workspaceId,
      actorId: userId,
      actorEmail: email,
      metadata: { name: existing.name, proposals: existing._count.proposalItems, retainers: existing._count.retainerItems },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Service delete error:", error);
    return serviceError(500, "SERVICE_DELETE_FAILED", "Failed to delete service");
  }
}
