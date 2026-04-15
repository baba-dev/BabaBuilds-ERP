import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const toDateOrNull = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function GET(request: Request) {
  try {
    // This endpoint is used by the in-app Tax page for regular authenticated users.
    // It must not require super-admin; keep it tenant-scoped via workspaceId (session) instead.

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)));

    // Optional: allow super-admin to query any workspaceId via query param.
    // Normal users will be constrained to their session workspaceId.
    const requestedWorkspaceId = searchParams.get('workspaceId') ?? undefined;
    const action = searchParams.get('action');
    const scopeType = searchParams.get('scopeType');
    const startDate = toDateOrNull(searchParams.get('startDate'));
    const endDate = toDateOrNull(searchParams.get('endDate'));

    let effectiveWorkspaceId: string | undefined = requestedWorkspaceId;
    try {
      await verifySuperAdmin();
    } catch {
      // Not a super-admin: lock to session workspaceId
      const session = await (await import("next-auth/next")).getServerSession((await import("@/lib/auth")).authOptions);
      effectiveWorkspaceId = (session as any)?.workspaceId;
      if (!effectiveWorkspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const where: {
      workspaceId?: string;
      action?: string;
      scopeType?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (effectiveWorkspaceId) where.workspaceId = effectiveWorkspaceId;
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
    return handleAdminApiError(error, 'Failed to fetch tax audit logs');
  }
}
