import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from '@/lib/activity-log';
import { apiError } from '@/lib/api-error';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null; email?: string | null };
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const { id } = await context.params;

    const existing = await prisma.serviceTemplate.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: "Service not found or unauthorized." }, { status: 404 });

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string | null;
    const longDescription = formData.get('longDescription') as string | null;
    const defaultPrice = formData.get('defaultPrice') as string;
    const nicCodeId = formData.get('nicCodeId') as string | null;
    const sacCodeId = formData.get('sacCodeId') as string | null;
    const showInShop = formData.get('showInShop') === 'true';

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        planTier: true,
        _count: {
          select: {
            serviceTemplates: {
              where: {
                showInShop: true,
                id: { not: id },
              },
            },
          },
        },
      },
    });

    if (!workspace) {
      return apiError(404, "Workspace not found", "WORKSPACE_NOT_FOUND");
    }

    if (showInShop && !existing.showInShop && workspace.planTier === "FREE" && workspace._count.serviceTemplates >= 3) {
      return apiError(403, "Upgrade Required", "PLAN_LIMIT_REACHED", {
        message: "You have reached the limit of 3 published services on the Free plan. Upgrade to Pro for unlimited published services.",
        requiresUpgrade: true,
      });
    }

    let imageUrl: string | null = (formData.get('existingImageUrl') as string) || null;

    const imageFile = formData.get('serviceImage') as File | null;
    if (imageFile && imageFile.size > 0) {
      const ext = path.extname(imageFile.name).toLowerCase();
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
      if (!allowedExtensions.includes(ext)) {
        return NextResponse.json({ error: "Invalid image type. Only PNG, JPG, or WEBP allowed." }, { status: 400 });
      }
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const dir = path.join(process.cwd(), 'public', 'uploads', 'service-hero', workspaceId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `hero-${Date.now()}-${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(dir, filename), buffer);
      imageUrl = `/uploads/service-hero/${workspaceId}/${filename}`;
    }

    const updated = await prisma.serviceTemplate.update({
      where: { id },
      data: {
        name,
        description: description || null,
        longDescription: longDescription || null,
        defaultPrice: Number(defaultPrice),
        nicCodeId: nicCodeId || null,
        sacCodeId: sacCodeId || null,
        showInShop,
        imageUrl,
      },
      include: { nicCode: true, sacCode: true },
    });

    logActivity({
      action: existing.showInShop !== showInShop ? 'shop.service.visibility' : 'shop.service.update',
      outcome: 'success',
      entityType: 'serviceTemplate',
      entityId: updated.id,
      workspaceId,
      actorId: session.user?.id ?? null,
      actorEmail: session.user?.email ?? null,
      metadata: {
        oldShowInShop: existing.showInShop,
        newShowInShop: showInShop,
        name: updated.name,
      },
    });

    return NextResponse.json({ success: true, service: updated });
  } catch (error) {
    console.error("Service PATCH Error:", error);
    return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = session.workspaceId;
    const { id } = await context.params;

    const existing = await prisma.serviceTemplate.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: "Service not found or unauthorized." }, { status: 404 });

    await prisma.serviceTemplate.delete({ where: { id } });

    logActivity({
      action: 'shop.service.delete',
      outcome: 'success',
      entityType: 'serviceTemplate',
      entityId: id,
      workspaceId,
      actorId: session.user?.id ?? null,
      actorEmail: session.user?.email ?? null,
      metadata: { name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}
