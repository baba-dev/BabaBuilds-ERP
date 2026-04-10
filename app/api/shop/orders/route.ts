import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/**
 * GET  /api/shop/orders          — list all orders for the workspace
 * PATCH /api/shop/orders/[id]    — update status
 * DELETE /api/shop/orders/[id]   — delete order record
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page   = parseInt(searchParams.get('page') || '1');
    const limit  = parseInt(searchParams.get('limit') || '50');

    const orders = await prisma.serviceOrder.findMany({
      where: {
        workspaceId,
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      include: {
        serviceTemplate: { select: { name: true, defaultPrice: true } },
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    (page - 1) * limit,
    });

    const total = await prisma.serviceOrder.count({
      where: { workspaceId, ...(status && status !== 'ALL' ? { status } : {}) },
    });

    return NextResponse.json({ orders, total, page, limit });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch orders.' }, { status: 500 });
  }
}
