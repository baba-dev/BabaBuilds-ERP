import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import {
  PayrollPolicyError,
  enforcePayrollTwoPersonControl,
  requirePayrollApprovalPolicy,
  requirePayrollPermission,
} from '@/lib/security/payroll-policy';
import { nextStatusForTransition, type PayrollRunTransitionAction } from '@/lib/payroll/run-transitions';

import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';

type Body = {
  action?: PayrollRunTransitionAction;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const action = body.action;
    const { id: runId } = await context.params;

    if (
      action !== 'submit_review' &&
      action !== 'approve' &&
      action !== 'return_draft' &&
      action !== 'return_review'
    ) {
      return NextResponse.json(
        {
          error: 'Invalid action.',
          code: 'INVALID_ACTION',
          allowed: ['submit_review', 'approve', 'return_draft', 'return_review'],
        },
        { status: 400 },
      );
    }

    if (action === 'approve') {
      const gate = await requirePayrollModuleAndAction('approve');
      if ('response' in gate) return gate.response!;
      const { access } = gate;

      const run = await prisma.payrollRun.findFirst({
        where: { id: runId, workspaceId: access.workspaceId },
        select: {
          id: true,
          status: true,
          generatedByUserId: true,
          posting: { select: { postingStatus: true } },
        },
      });

      if (!run) {
        return NextResponse.json({ error: 'Payroll run not found.', code: 'NOT_FOUND' }, { status: 404 });
      }

      if (run.posting?.postingStatus === 'POSTED' || run.status === 'POSTED') {
        return NextResponse.json({ error: 'Run is already posted.', code: 'ALREADY_POSTED' }, { status: 409 });
      }

      if (run.status !== 'REVIEW') {
        return NextResponse.json(
          { error: 'Only runs in REVIEW can be approved.', code: 'INVALID_STATE' },
          { status: 409 },
        );
      }

      try {
        await requirePayrollApprovalPolicy({
          actorUserId: access.userId,
          workspaceId: access.workspaceId,
          preparedByUserId: run.generatedByUserId,
          actorEmail: access.email,
          entityId: runId,
          request,
        });
      } catch (err) {
        if (err instanceof PayrollPolicyError) {
          return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
        }
        throw err;
      }

      const nextStatus = nextStatusForTransition(run.status, 'approve');

      const updated = await prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: nextStatus,
          approvedAt: new Date(),
        },
      });

      await logActivity({
        request,
        workspaceId: access.workspaceId,
        actor: { userId: access.userId, email: access.email },
        action: 'PAYROLL_RUN_APPROVED',
        status: 'SUCCESS',
        entity: { type: 'PayrollRun', id: runId },
        metadata: { previousStatus: run.status, nextStatus },
      });

      return NextResponse.json({
        success: true,
        runId,
        status: updated.status,
        approvedAt: updated.approvedAt?.toISOString() ?? null,
      });
    }

    if (action === 'return_review') {
      const gate = await requirePayrollModuleAndAction('approve');
      if ('response' in gate) return gate.response!;
      const { access } = gate;

      const run = await prisma.payrollRun.findFirst({
        where: { id: runId, workspaceId: access.workspaceId },
        select: {
          id: true,
          status: true,
          generatedByUserId: true,
          posting: { select: { postingStatus: true } },
        },
      });

      if (!run) {
        return NextResponse.json({ error: 'Payroll run not found.', code: 'NOT_FOUND' }, { status: 404 });
      }

      if (run.posting?.postingStatus === 'POSTED' || run.status === 'POSTED') {
        return NextResponse.json({ error: 'Run is already posted.', code: 'ALREADY_POSTED' }, { status: 409 });
      }

      if (run.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'Only APPROVED runs can be sent back to review.', code: 'INVALID_STATE' },
          { status: 409 },
        );
      }

      const { role } = await requirePayrollPermission(access.userId, access.workspaceId, 'approve');
      enforcePayrollTwoPersonControl({
        actorUserId: access.userId,
        actorRole: role,
        preparedByUserId: run.generatedByUserId,
      });

      const nextStatus = nextStatusForTransition(run.status, 'return_review');

      const updated = await prisma.payrollRun.update({
        where: { id: runId },
        data: { status: nextStatus, approvedAt: null },
      });

      await logActivity({
        request,
        workspaceId: access.workspaceId,
        actor: { userId: access.userId, email: access.email },
        action: 'PAYROLL_RUN_RETURNED_REVIEW',
        status: 'SUCCESS',
        entity: { type: 'PayrollRun', id: runId },
        metadata: { previousStatus: run.status, nextStatus },
      });

      return NextResponse.json({
        success: true,
        runId,
        status: updated.status,
      });
    }

    // submit_review | return_draft
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response!;
    const { access } = gate;

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, workspaceId: access.workspaceId },
      select: {
        id: true,
        status: true,
        posting: { select: { postingStatus: true } },
      },
    });

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found.', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (run.posting?.postingStatus === 'POSTED' || run.status === 'POSTED') {
      return NextResponse.json({ error: 'Run is already posted.', code: 'ALREADY_POSTED' }, { status: 409 });
    }

    if (action === 'submit_review') {
      if (run.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'Only DRAFT runs can be submitted for review.', code: 'INVALID_STATE' },
          { status: 409 },
        );
      }
      const nextStatus = nextStatusForTransition(run.status, 'submit_review');
      await prisma.payrollRun.update({
        where: { id: runId },
        data: { status: nextStatus },
      });

      await logActivity({
        request,
        workspaceId: access.workspaceId,
        actor: { userId: access.userId, email: access.email },
        action: 'PAYROLL_RUN_SUBMITTED_REVIEW',
        status: 'SUCCESS',
        entity: { type: 'PayrollRun', id: runId },
        metadata: { previousStatus: run.status, nextStatus },
      });

      return NextResponse.json({ success: true, runId, status: nextStatus });
    }

    if (action === 'return_draft') {
      if (run.status !== 'REVIEW') {
        return NextResponse.json(
          { error: 'Only REVIEW runs can be returned to draft.', code: 'INVALID_STATE' },
          { status: 409 },
        );
      }
      const nextStatus = nextStatusForTransition(run.status, 'return_draft');
      await prisma.payrollRun.update({
        where: { id: runId },
        data: { status: nextStatus, approvedAt: null },
      });

      await logActivity({
        request,
        workspaceId: access.workspaceId,
        actor: { userId: access.userId, email: access.email },
        action: 'PAYROLL_RUN_RETURNED_DRAFT',
        status: 'SUCCESS',
        entity: { type: 'PayrollRun', id: runId },
        metadata: { previousStatus: run.status, nextStatus },
      });

      return NextResponse.json({ success: true, runId, status: nextStatus });
    }

    return NextResponse.json({ error: 'Unhandled action.' }, { status: 400 });
  } catch (err) {
    console.error('[payroll/runs/transition]', err);
    const message = err instanceof Error ? err.message : 'Transition failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
