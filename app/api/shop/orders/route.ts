import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

type SessionContext = {
  workspaceId?: string;
};

/**
 * GET  /api/shop/orders          — list orders for the workspace (paginated)
 */
export async function GET(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const orderWhere = {
      workspaceId,
      ...(status && status !== 'ALL' ? { status } : {}),
    };

    const [orders, total, allStatusCounts, paidAgg] = await Promise.all([
      prisma.serviceOrder.findMany({
        where: orderWhere,
        include: {
          serviceTemplate: { select: { name: true, defaultPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.serviceOrder.count({ where: orderWhere }),
      prisma.serviceOrder.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      prisma.serviceOrder.aggregate({
        where: { workspaceId, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const statusCounts = {
      PAID: 0,
      PENDING: 0,
      FAILED: 0,
      REFUNDED: 0,
    };

    for (const row of allStatusCounts) {
      if (row.status in statusCounts) {
        const key = row.status as keyof typeof statusCounts;
        statusCounts[key] = row._count._all;
      }
    }

    return NextResponse.json({
      orders,
      total,
      page,
      limit,
      overview: {
        totalOrders: allStatusCounts.reduce((acc, row) => acc + row._count._all, 0),
        statusCounts,
        paidRevenue: Number(paidAgg._sum.amount ?? 0),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders.' }, { status: 500 });
  }
}
