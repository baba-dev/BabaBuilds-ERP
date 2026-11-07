import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { parseServiceForm, sameServiceName } from "@/lib/services/validation";
import { saveServiceImage } from "@/lib/services/image-upload";
import { requireServiceAccess, serviceError } from "@/lib/services/access";
import { SERVICE_INCLUDE, withUsage } from "@/lib/services/serialize";

export async function GET(request: Request) {
  try {
    const auth = await requireServiceAccess("read");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, 120);
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 500));

    const services = await prisma.serviceTemplate.findMany({
      where: {
        workspaceId: auth.access.workspaceId,
        ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }] } : {}),
      },
      include: SERVICE_INCLUDE,
      orderBy: { name: "asc" },
      take: limit,
    });

    return NextResponse.json(services.map(withUsage), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Service list error:", error);
    return serviceError(500, "SERVICES_FETCH_FAILED", "Failed to fetch services");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireServiceAccess("write");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId, email } = auth.access;

    const formData = await request.formData();
    const parsed = parseServiceForm(formData);
    if (!parsed.success) return serviceError(400, "INVALID_SERVICE", parsed.error.issues[0]?.message ?? "Invalid service details.");
    const data = parsed.data;

    // Referenced tax codes must exist (a bad id would otherwise surface as a 500 foreign-key error).
    const [nic, sac, sameName] = await Promise.all([
      data.nicCodeId ? prisma.nICCode.findUnique({ where: { id: data.nicCodeId }, select: { id: true } }) : Promise.resolve(true),
      data.sacCodeId ? prisma.sACCode.findUnique({ where: { id: data.sacCodeId }, select: { id: true } }) : Promise.resolve(true),
      prisma.serviceTemplate.findMany({ where: { workspaceId, name: { contains: data.name } }, select: { name: true } }),
    ]);
    if (!nic || !sac) return serviceError(400, "INVALID_TAX_CODE", "The selected tax classification no longer exists.");
    if (sameName.some((s) => sameServiceName(s.name, data.name))) {
      return serviceError(409, "DUPLICATE_NAME", "A service with this name already exists.");
    }

    let imageUrl: string | null = null;
    const imageFile = formData.get("serviceImage");
    if (imageFile instanceof File && imageFile.size > 0) {
      const saved = await saveServiceImage(workspaceId, imageFile);
      if (!saved.ok) return serviceError(saved.status, saved.code, saved.message);
      imageUrl = saved.url;
    }

    const created = await prisma.serviceTemplate.create({
      data: { workspaceId, ...data, imageUrl },
      include: SERVICE_INCLUDE,
    });

    logActivity({
      action: "service.create",
      outcome: "success",
      entityType: "serviceTemplate",
      entityId: created.id,
      workspaceId,
      actorId: userId,
      actorEmail: email,
      metadata: { name: created.name },
    });

    return NextResponse.json({ success: true, service: withUsage(created) }, { status: 201 });
  } catch (error) {
    console.error("Service creation error:", error);
    return serviceError(500, "SERVICE_CREATE_FAILED", "Failed to create service");
  }
}
