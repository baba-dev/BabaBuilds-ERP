import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from '@/lib/rbac';
import { isModuleEnabled } from '@/lib/modules';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null };
};

/**
 * GET  /api/shop/orders          — list orders for the workspace (paginated)
 *
 * Requires:
 *   - SHOP module enabled for the workspace
 *   - `shop.orders.view` permission
 */
export async function GET(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const userId = session.user.id;

    if (!(await isModuleEnabled(workspaceId, 'SHOP'))) {
      return NextResponse.json(
        { error: 'Shop module is disabled for this workspace.', code: 'SHOP_MODULE_DISABLED' },
        { status: 409 },
      );
    }

    const perm = await withPermission(userId, workspaceId, 'shop.orders.view');
    if (!perm.granted) return perm.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const orderWhere = {
      workspaceId,
      ...(status && status !== 'ALL' ? { status } : {}),
    };

    const [orders, total, allStatusCounts, paidAgg] = await Promise.all([
      prisma.shopOrder.findMany({
        where: orderWhere,
        include: {
          items: { select: { productName: true, quantity: true, unitPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.shopOrder.count({ where: orderWhere }),
      prisma.shopOrder.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      prisma.shopOrder.aggregate({
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
