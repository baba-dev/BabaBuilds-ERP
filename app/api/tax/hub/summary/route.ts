import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { getTaxReadinessSummary } from '@/lib/tax/return-prep';
import { getGstWorkspaceSummary } from '@/lib/tax/gst-workspace-summary';
import { taxAdvancedModuleDisabledResponse } from '@/lib/tax/module-gate';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
    if (moduleDisabledResponse) return moduleDisabledResponse;

    await requirePermission(userId, workspaceId, 'tax.view');

  const [readiness, returnPeriods, obligations, auditEvents, gstSummary] = await Promise.all([
    getTaxReadinessSummary(workspaceId, { includeSummary: true }),
    prisma.taxReturnPeriod.findMany({
      where: { workspaceId },
      orderBy: { dueDate: 'asc' },
      take: 24,
      select: {
        id: true,
        periodKey: true,
        periodStart: true,
        periodEnd: true,
        dueDate: true,
        filedAt: true,
        status: true,
      },
    }),
    prisma.taxObligation.findMany({
      where: { workspaceId },
      orderBy: { dueDate: 'asc' },
      take: 24,
      include: {
        taxRegistration: { select: { taxType: true, jurisdictionCode: true } },
        period: { select: { periodStart: true, periodEnd: true } },
      },
    }),
    prisma.taxAuditEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        eventType: true,
        correlationId: true,
        entityType: true,
        entityId: true,
        payloadJson: true,
        createdAt: true,
      },
    }),
    getGstWorkspaceSummary(prisma, workspaceId, new Date()),
  ]);

    return NextResponse.json({
      readiness,
      gstSummary,
      returnPeriods: returnPeriods.map((p) => ({
        ...p,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        dueDate: p.dueDate.toISOString(),
        filedAt: p.filedAt?.toISOString() ?? null,
      })),
      obligations: obligations.map((o) => ({
        id: o.id,
        periodKey: o.periodKey,
        dueDate: o.dueDate.toISOString(),
        status: o.status,
        filedAt: o.filedAt?.toISOString() ?? null,
        taxType: o.taxRegistration.taxType,
        jurisdictionCode: o.taxRegistration.jurisdictionCode,
        periodStart: o.period?.periodStart.toISOString() ?? null,
        periodEnd: o.period?.periodEnd.toISOString() ?? null,
      })),
      auditEvents: auditEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        correlationId: e.correlationId,
        entityType: e.entityType,
        entityId: e.entityId,
        createdAt: e.createdAt.toISOString(),
        payload: e.payloadJson,
      })),
    });
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }
}
