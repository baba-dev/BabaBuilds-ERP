import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
import { RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requirePayrollPermission } from '@/lib/security/payroll-policy';
import type {
  PayrollOverviewResponseDto,
  PayrollPeriodSummaryDto,
  PayrollRunListItemDto,
  PayrollRunStatusDto,
} from '@/lib/payroll/types';

function mapRunStatus(s: string): PayrollRunStatusDto {
  if (s === 'DRAFT' || s === 'REVIEW' || s === 'APPROVED' || s === 'POSTED') return s;
  return 'DRAFT';
}

function serializeRun(run: {
  id: string;
  version: number;
  status: string;
  totalEarnings: Prisma.Decimal;
  totalDeductions: Prisma.Decimal;
  totalEmployerCosts: Prisma.Decimal;
  totalNetPay: Prisma.Decimal;
  generatedAt: Date;
  approvedAt: Date | null;
}): PayrollRunListItemDto {
  return {
    id: run.id,
    version: run.version,
    status: mapRunStatus(run.status),
    totalEarnings: run.totalEarnings.toFixed(2),
    totalDeductions: run.totalDeductions.toFixed(2),
    totalEmployerCosts: run.totalEmployerCosts.toFixed(2),
    totalNetPay: run.totalNetPay.toFixed(2),
    generatedAt: run.generatedAt.toISOString(),
    approvedAt: run.approvedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as { workspaceId?: string } | null;
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = typedSession?.workspaceId ?? (await getWorkspaceIdForUser(userId));
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payrollEnabled = await isModuleEnabled(workspaceId, 'PAYROLL');
    if (!payrollEnabled) {
      return NextResponse.json(
        { error: 'Payroll module is not enabled for this workspace.', code: 'MODULE_DISABLED' },
        { status: 403 },
      );
    }

    try {
      await requirePayrollPermission(userId, workspaceId, 'view');
    } catch (err) {
      if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
      throw err;
    }

    const periods = await prisma.payrollPeriod.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'desc' },
      take: 12,
      include: {
        runs: {
          orderBy: [{ version: 'desc' }, { generatedAt: 'desc' }],
          take: 1,
        },
      },
    });

    const periodIds = periods.map((p) => p.id);

    const runsInWindow =
      periodIds.length > 0
        ? await prisma.payrollRun.findMany({
            where: { workspaceId, periodId: { in: periodIds } },
            select: {
              id: true,
              version: true,
              status: true,
              totalEarnings: true,
              totalDeductions: true,
              totalEmployerCosts: true,
              totalNetPay: true,
              generatedAt: true,
              approvedAt: true,
            },
          })
        : [];

    const statusGroups =
      periodIds.length > 0
        ? await prisma.payrollRun.groupBy({
            by: ['status'],
            where: { workspaceId, periodId: { in: periodIds } },
            _count: { _all: true },
          })
        : [];

    const zero = new Prisma.Decimal(0);
    const kpisAgg = runsInWindow.reduce(
      (acc, r) => ({
        totalEarnings: acc.totalEarnings.plus(r.totalEarnings),
        totalDeductions: acc.totalDeductions.plus(r.totalDeductions),
        totalEmployerCosts: acc.totalEmployerCosts.plus(r.totalEmployerCosts),
        totalNetPay: acc.totalNetPay.plus(r.totalNetPay),
      }),
      {
        totalEarnings: zero,
        totalDeductions: zero,
        totalEmployerCosts: zero,
        totalNetPay: zero,
      },
    );

    const periodSummaries: PayrollPeriodSummaryDto[] = periods.map((p) => ({
      id: p.id,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate.toISOString(),
      status: p.status,
      latestRun: p.runs[0] ? serializeRun(p.runs[0]) : null,
    }));

    const statusCounts = statusGroups.map((g) => ({
      status: mapRunStatus(g.status),
      count: g._count._all,
    }));

    const payload: PayrollOverviewResponseDto = {
      periods: periodSummaries,
      kpis: {
        grossPayroll: kpisAgg.totalEarnings.toFixed(2),
        deductions: kpisAgg.totalDeductions.toFixed(2),
        netPayout: kpisAgg.totalNetPay.toFixed(2),
        employerCost: kpisAgg.totalEmployerCosts.toFixed(2),
        runCount: runsInWindow.length,
      },
      statusCounts,
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error('[payroll/overview]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
