import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import type { Session } from 'next-auth';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
type SessionWithWorkspace = Session & { workspaceId?: string };

const toDateOrNull = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function GET(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)));

    const action = searchParams.get('action');
    const scopeType = searchParams.get('scopeType');
    const startDate = toDateOrNull(searchParams.get('startDate'));
    const endDate = toDateOrNull(searchParams.get('endDate'));

    const where: {
      workspaceId: string;
      action?: string;
      scopeType?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { workspaceId };
    if (action && action !== 'ALL') where.action = action;
    if (scopeType && scopeType !== 'ALL') where.scopeType = scopeType;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const [total, logs] = await Promise.all([
      prisma.taxRateOverrideAuditLog.count({ where }),
      prisma.taxRateOverrideAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error('Tax audit GET error', error);
    return NextResponse.json({ error: 'Failed to fetch tax audit logs' }, { status: 500 });
  }
}
