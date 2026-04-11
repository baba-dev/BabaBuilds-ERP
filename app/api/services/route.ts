import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from '@/lib/activity-log';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null; email?: string | null };
};

export async function GET() {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const services = await prisma.serviceTemplate.findMany({
      where: { workspaceId: session.workspaceId },
      include: { nicCode: true, sacCode: true },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(services);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string | null;
    const longDescription = formData.get('longDescription') as string | null;
    const defaultPrice = formData.get('defaultPrice') as string;
    const nicCodeId = formData.get('nicCodeId') as string | null;
    const sacCodeId = formData.get('sacCodeId') as string | null;
    const showInShop = formData.get('showInShop') === 'true';

    let imageUrl: string | null = null;

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

    const newService = await prisma.serviceTemplate.create({
      data: {
        workspaceId,
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
      action: 'shop.service.create',
      outcome: 'success',
      entityType: 'serviceTemplate',
      entityId: newService.id,
      workspaceId,
      actorId: session.user?.id ?? null,
      actorEmail: session.user?.email ?? null,
      metadata: { showInShop, name: newService.name },
    });

    return NextResponse.json({ success: true, service: newService });
  } catch (error) {
    console.error("Service Creation Error:", error);
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
  }
}
