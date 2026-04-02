import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // Fetch workspace services and INCLUDE the linked dictionary data
    const services = await prisma.serviceTemplate.findMany({
      where: { workspaceId: workspaceId },
      include: {
        nicCode: true,
        sacCode: true
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(services);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const { name, description, defaultPrice, nicCodeId, sacCodeId } = await request.json();

    const newService = await prisma.serviceTemplate.create({
      data: {
        workspaceId,
        name,
        description,
        defaultPrice: Number(defaultPrice),
        nicCodeId: nicCodeId || null,
        sacCodeId: sacCodeId || null,
      }
    });

    return NextResponse.json({ success: true, service: newService });
  } catch (error) {
    console.error("Service Creation Error:", error);
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
  }
}