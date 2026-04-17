import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { withPermission } from '@/lib/rbac';
import {
  acquireFinancialIdempotency,
  buildRequestHash,
  consumeFinancialIdempotency,
  releaseFinancialIdempotency,
} from '@/lib/financial-idempotency';
import { logActivity } from '@/lib/security/activity-log';
import { createPayrollPosting, PAYROLL_POSTING_OPERATION } from '@/lib/payroll/posting';

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

const toDecimal = (value: unknown): Prisma.Decimal | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return new Prisma.Decimal(value.toFixed(2));
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let idempotencyContext: { workspaceId: string; operation: string; idempotencyKey: string } | null = null;
  let idempotencyConsumed = false;

  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as any)?.workspaceId as string | undefined;
    const actorUserId = (session?.user as { id?: string | null } | undefined)?.id ?? null;
    const actorEmail = (session?.user as { email?: string | null } | undefined)?.email ?? null;

    if (!workspaceId || !actorUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const perm = await withPermission(actorUserId, workspaceId, 'accounting.post');
    if (!perm.granted) return perm.response as any;

    const { id: runId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as PayrollPostBody;

    if (body.status !== 'APPROVED') {
      await logActivity({
        request,
        workspaceId,
        actor: { userId: actorUserId, email: actorEmail },
        action: 'PAYROLL_RUN_POST_BLOCKED',
        status: 'WARNING',
        entity: { type: 'PayrollRun', id: runId },
        metadata: { reason: 'STATE_GATE_FAILED', required: 'APPROVED', actual: body.status ?? null },
      });
      return NextResponse.json(
        { error: 'Only APPROVED payroll runs can be posted.', code: 'PAYROLL_STATE_GATE' },
        { status: 409 },
      );
    }

    const payrollExpense = toDecimal(body.totals?.payrollExpense);
    const taxLiability = toDecimal(body.totals?.taxLiability);
    const benefitsLiability = toDecimal(body.totals?.benefitsLiability);
    const wagesPayable = toDecimal(body.totals?.wagesPayable);

    if (!payrollExpense || !taxLiability || !benefitsLiability || !wagesPayable) {
      return NextResponse.json(
        { error: 'Invalid payroll totals payload.', code: 'INVALID_PAYROLL_TOTALS' },
        { status: 400 },
      );
    }

    const approvedAt = body.approvedAt ? new Date(body.approvedAt) : new Date();
    if (Number.isNaN(approvedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid approvedAt timestamp.' }, { status: 400 });
    }

    const operation = PAYROLL_POSTING_OPERATION;
    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || body.idempotencyKey?.trim() || `auto:${runId}:post`;
    const requestHash = buildRequestHash({ runId, status: body.status, approvedAt: approvedAt.toISOString(), totals: body.totals });

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
      payrollExpense,
      taxLiability,
      benefitsLiability,
      wagesPayable,
      sourceRef: body.sourceRef ?? null,
      actorUserId,
      actorEmail,
      requestId: request.headers.get('x-request-id')?.trim() || null,
    });

    const responseBody = {
      success: true,
      payrollRunId: runId,
      accountingTransactionId: posting.accountingTransactionId,
      accountingEntryIds: posting.accountingEntryIds,
      cashForecast: {
        sourceType: posting.cashForecastSourceType,
        outflowAmount: posting.cashOutflowAmount.toFixed(2),
      },
      references: {
        sourceTable: 'PAYROLL_RUN',
        sourceId: runId,
      },
      created: posting.created,
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
    return NextResponse.json({ error: 'Failed to post payroll run.' }, { status: 500 });
  } finally {
    if (idempotencyContext && !idempotencyConsumed) {
      await releaseFinancialIdempotency(idempotencyContext);
    }
  }
}
