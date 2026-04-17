import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { isModuleEnabled } from '@/lib/modules';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
import {
  acquireFinancialIdempotency,
  buildRequestHash,
  consumeFinancialIdempotency,
  releaseFinancialIdempotency,
} from '@/lib/financial-idempotency';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollPermission } from '@/lib/security/payroll-policy';
import {
  buildPayrollPostResponseBody,
  createPayrollPosting,
  mapPayrollRunTotalsToJournalAmounts,
  PAYROLL_ACCOUNT_CODES,
  PAYROLL_POSTING_OPERATION,
} from '@/lib/payroll/posting';

type PayrollPostBody = {
  status?: string;
  approvedAt?: string;
  postingCurrency?: string;
  sourceRef?: string;
  totals?: {
    payrollExpense?: number;
    taxLiability?: number;
    benefitsLiability?: number;
    wagesPayable?: number;
  };
  idempotencyKey?: string;
};

function decimalStringsEqual(a: Prisma.Decimal, b: number | undefined): boolean {
  if (typeof b !== 'number' || !Number.isFinite(b)) return false;
  return a.equals(new Prisma.Decimal(b.toFixed(2)));
}

async function buildPostedResponseFromDb(runId: string, workspaceId: string) {
  const posting = await prisma.payrollPosting.findUnique({
    where: { runId },
  });
  if (!posting?.accountingTransactionId) return null;

  const acct = await prisma.accountingTransaction.findUnique({
    where: { id: posting.accountingTransactionId },
    include: {
      entries: {
        orderBy: { lineNumber: 'asc' },
        select: { id: true, accountCode: true, side: true, amount: true },
      },
    },
  });
  if (!acct) return null;

  const cashOutflowAmount = acct.entries
    .filter((e) => e.accountCode === PAYROLL_ACCOUNT_CODES.cashClearing && e.side === 'CREDIT')
    .reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

  return buildPayrollPostResponseBody({
    payrollRunId: runId,
    created: false,
    accountingTransactionId: acct.id,
    accountingEntryIds: acct.entries.map((e) => e.id),
    cashForecastSourceType: 'PAYROLL',
    cashOutflowAmount,
    journalReference: posting.journalReference ?? null,
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let idempotencyContext: { workspaceId: string; operation: string; idempotencyKey: string } | null = null;
  let idempotencyConsumed = false;

  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as { workspaceId?: string } | null;
    const actorUserId = (session?.user as { id?: string | null } | undefined)?.id ?? null;
    const actorEmail = (session?.user as { email?: string | null } | undefined)?.email ?? null;

    if (!actorUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId =
      typedSession?.workspaceId ?? (await getWorkspaceIdForUser(actorUserId));
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
      await requirePayrollPermission(actorUserId, workspaceId, 'post');
    } catch (err) {
      if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
      throw err;
    }

    const { id: runId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as PayrollPostBody;

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, workspaceId },
      include: {
        posting: true,
        lineItems: { select: { earnings: true, deductions: true, employerCosts: true, netPay: true } },
      },
    });

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found.', code: 'NOT_FOUND' }, { status: 404 });
    }

    const alreadyPosted =
      run.status === 'POSTED' &&
      run.posting?.postingStatus === 'POSTED' &&
      Boolean(run.posting.accountingTransactionId);

    if (alreadyPosted) {
      const replayBody = await buildPostedResponseFromDb(runId, workspaceId);
      if (replayBody) {
        return NextResponse.json({ ...replayBody, replayed: true });
      }
    }

    if (run.status !== 'APPROVED') {
      await logActivity({
        request,
        workspaceId,
        actor: { userId: actorUserId, email: actorEmail },
        action: 'PAYROLL_RUN_POST_BLOCKED',
        status: 'WARNING',
        entity: { type: 'PayrollRun', id: runId },
        metadata: {
          reason: 'STATE_GATE_FAILED',
          required: 'APPROVED',
          actual: run.status,
          ignoredClientStatus: body.status ?? null,
        },
      });
      return NextResponse.json(
        { error: 'Only APPROVED payroll runs can be posted.', code: 'PAYROLL_STATE_GATE' },
        { status: 409 },
      );
    }

    // Authoritative totals: run header when any non-zero; else aggregate line items.
    let totalEarnings = new Prisma.Decimal(run.totalEarnings);
    let totalDeductions = new Prisma.Decimal(run.totalDeductions);
    let totalEmployerCosts = new Prisma.Decimal(run.totalEmployerCosts);
    let totalNetPay = new Prisma.Decimal(run.totalNetPay);

    const headerAllZero =
      totalEarnings.isZero() &&
      totalDeductions.isZero() &&
      totalEmployerCosts.isZero() &&
      totalNetPay.isZero();

    if (headerAllZero && run.lineItems.length > 0) {
      totalEarnings = run.lineItems.reduce((s, li) => s.plus(li.earnings), new Prisma.Decimal(0));
      totalDeductions = run.lineItems.reduce((s, li) => s.plus(li.deductions), new Prisma.Decimal(0));
      totalEmployerCosts = run.lineItems.reduce((s, li) => s.plus(li.employerCosts), new Prisma.Decimal(0));
      totalNetPay = run.lineItems.reduce((s, li) => s.plus(li.netPay), new Prisma.Decimal(0));
    }

    const authoritativeHeader = {
      totalEarnings: totalEarnings.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalEmployerCosts: totalEmployerCosts.toFixed(2),
      totalNetPay: totalNetPay.toFixed(2),
      source: headerAllZero && run.lineItems.length > 0 ? 'line_items' : 'run_header',
    };

    const journal = mapPayrollRunTotalsToJournalAmounts({
      totalEarnings,
      totalDeductions,
      totalEmployerCosts,
      totalNetPay,
    });

    const authoritativeJournal = {
      payrollExpense: journal.payrollExpense.toFixed(2),
      taxLiability: journal.taxLiability.toFixed(2),
      benefitsLiability: journal.benefitsLiability.toFixed(2),
      wagesPayable: journal.wagesPayable.toFixed(2),
    };

    const clientSentFinancialHint =
      body.status !== undefined ||
      (body.totals !== undefined &&
        (body.totals.payrollExpense !== undefined ||
          body.totals.taxLiability !== undefined ||
          body.totals.benefitsLiability !== undefined ||
          body.totals.wagesPayable !== undefined));

    if (clientSentFinancialHint) {
      const mismatch =
        !decimalStringsEqual(journal.payrollExpense, body.totals?.payrollExpense) ||
        !decimalStringsEqual(journal.taxLiability, body.totals?.taxLiability) ||
        !decimalStringsEqual(journal.benefitsLiability, body.totals?.benefitsLiability) ||
        !decimalStringsEqual(journal.wagesPayable, body.totals?.wagesPayable) ||
        (body.status !== undefined && body.status !== 'APPROVED');

      await logActivity({
        request,
        workspaceId,
        actor: { userId: actorUserId, email: actorEmail },
        action: 'PAYROLL_POST_PAYLOAD_AUDIT',
        status: mismatch ? 'WARNING' : 'INFO',
        entity: { type: 'PayrollRun', id: runId },
        metadata: {
          requestedPayload: {
            status: body.status ?? null,
            totals: body.totals ?? null,
          },
          authoritativeTotals: {
            header: authoritativeHeader,
            journal: authoritativeJournal,
          },
          mismatch,
        },
      });
    }

    const approvedAt = run.approvedAt ?? new Date();
    const operation = PAYROLL_POSTING_OPERATION;
    const idempotencyKey =
      request.headers.get('Idempotency-Key')?.trim() ||
      body.idempotencyKey?.trim() ||
      `auto:${runId}:post`;

    const requestHash = buildRequestHash({
      runId,
      approvedAt: approvedAt.toISOString(),
      authoritativeJournal,
    });

    const acquired = await acquireFinancialIdempotency({ workspaceId, operation, idempotencyKey, requestHash });
    idempotencyContext = { workspaceId, operation, idempotencyKey };

    if (acquired.kind === 'hash_mismatch') {
      return NextResponse.json({ error: 'Conflicting idempotency payload.', code: 'IDEMPOTENCY_HASH_MISMATCH' }, { status: 409 });
    }
    if (acquired.kind === 'in_progress') {
      return NextResponse.json({ error: 'Payroll posting is already in progress.', code: 'REQUEST_IN_PROGRESS' }, { status: 409 });
    }
    if (acquired.kind === 'replay') {
      return NextResponse.json({ ...(acquired.responseBody as object), replayed: true });
    }

    const posting = await createPayrollPosting({
      runId,
      workspaceId,
      approvedAt,
      postingCurrency: (body.postingCurrency || 'INR').toUpperCase(),
      payrollExpense: journal.payrollExpense,
      taxLiability: journal.taxLiability,
      benefitsLiability: journal.benefitsLiability,
      wagesPayable: journal.wagesPayable,
      idempotencyKey,
      sourceRef: body.sourceRef ?? null,
      actorUserId,
      actorEmail,
      requestId: request.headers.get('x-request-id')?.trim() || null,
    });

    const responseBody = {
      ...buildPayrollPostResponseBody({ payrollRunId: runId, ...posting }),
      authoritativeTotals: authoritativeHeader,
    };

    await consumeFinancialIdempotency({ workspaceId, operation, idempotencyKey, responseBody });
    idempotencyConsumed = true;

    await logActivity({
      request,
      workspaceId,
      actor: { userId: actorUserId, email: actorEmail },
      action: 'PAYROLL_RUN_POSTED',
      status: 'SUCCESS',
      entity: { type: 'PayrollRun', id: runId },
      metadata: responseBody,
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('Payroll posting error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('PAYROLL_POSTING_CONFLICT')) {
      return NextResponse.json({ error: message, code: 'PAYROLL_POSTING_CONFLICT' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to post payroll run.' }, { status: 500 });
  } finally {
    if (idempotencyContext && !idempotencyConsumed) {
      await releaseFinancialIdempotency(idempotencyContext);
    }
  }
}
