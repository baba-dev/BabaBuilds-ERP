import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
import { RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requirePayrollPermission } from '@/lib/security/payroll-policy';
import { getPayrollRunActionCapabilities } from '@/app/api/payroll/_context';
import type { PayrollRunDetailDto, PayrollRunStatusDto } from '@/lib/payroll/types';

function mapRunStatus(s: string): PayrollRunStatusDto {
  if (s === 'DRAFT' || s === 'REVIEW' || s === 'APPROVED' || s === 'POSTED') return s;
  return 'DRAFT';
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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

    const { id: runId } = await context.params;

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, workspaceId },
      include: {
        period: true,
        posting: true,
        lineItems: {
          orderBy: { createdAt: 'asc' },
          include: {
            employeeSnapshot: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found.', code: 'NOT_FOUND' }, { status: 404 });
    }

    const isPostedFinancially = run.posting?.postingStatus === 'POSTED' || run.status === 'POSTED';
    const capabilities = await getPayrollRunActionCapabilities(
      userId,
      workspaceId,
      run.status,
      isPostedFinancially,
    );

    const payload: PayrollRunDetailDto = {
      id: run.id,
      workspaceId: run.workspaceId,
      periodId: run.periodId,
      version: run.version,
      status: mapRunStatus(run.status),
      preparedByUserId: run.generatedByUserId,
      totalEarnings: run.totalEarnings.toFixed(2),
      totalDeductions: run.totalDeductions.toFixed(2),
      totalEmployerCosts: run.totalEmployerCosts.toFixed(2),
      totalNetPay: run.totalNetPay.toFixed(2),
      generatedAt: run.generatedAt.toISOString(),
      approvedAt: run.approvedAt?.toISOString() ?? null,
      capabilities,
      period: {
        id: run.period.id,
        startDate: run.period.startDate.toISOString(),
        endDate: run.period.endDate.toISOString(),
        status: run.period.status,
      },
      lineItems: run.lineItems.map((li) => ({
        id: li.id,
        earnings: li.earnings.toFixed(2),
        deductions: li.deductions.toFixed(2),
        employerCosts: li.employerCosts.toFixed(2),
        netPay: li.netPay.toFixed(2),
        currency: li.currency,
        breakdownJson: li.breakdownJson,
        calculationLog: li.calculationLog,
        employee: {
          id: li.employeeSnapshot.employeeId,
          employeeCode: li.employeeSnapshot.employeeCode,
          firstName: li.employeeSnapshot.firstName,
          lastName: li.employeeSnapshot.lastName,
          email: li.employeeSnapshot.email,
          departmentName: li.employeeSnapshot.departmentName,
          designation: li.employeeSnapshot.designation,
        },
      })),
      posting: run.posting
        ? {
            postingStatus: run.posting.postingStatus,
            postedAt: run.posting.postedAt?.toISOString() ?? null,
            journalReference: run.posting.journalReference,
            accountingTransactionId: run.posting.accountingTransactionId,
            errorMessage: run.posting.errorMessage,
          }
        : null,
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error('[payroll/runs/[id]]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
