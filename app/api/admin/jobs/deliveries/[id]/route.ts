import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };
type Action = 'retry-pre-send' | 'confirm-accepted' | 'suppress';

class RecoveryConflict extends Error {}

/** Mutations are CAS-gated and include an atomic AppActivityLog audit entry. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const admin = await verifySuperAdmin();
    const limit = await enforceRouteRateLimit({
      request, route: '/api/admin/jobs/deliveries/action', scope: admin.userId,
      max: 6, windowMs: 60_000,
    });
    if (!limit.ok) return limit.response;
    const { id } = await ctx.params;
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) {
      return NextResponse.json({ code: 'INVALID_ID' }, { status: 400 });
    }
    if (Number(request.headers.get('content-length') || 0) > 2048) {
      return NextResponse.json({ code: 'INVALID_BODY' }, { status: 400 });
    }
    let input: Record<string, unknown>;
    try {
      const body = await request.text();
      if (body.length > 2048) throw new Error('TOO_LARGE');
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ code: 'INVALID_BODY' }, { status: 400 });
    }
    const action = input.action as Action;
    const reason = input.reason;
    const receipt = input.providerEvidence;
    if (!['retry-pre-send', 'confirm-accepted', 'suppress'].includes(action) ||
        typeof reason !== 'string' || reason.length < 16 || reason.length > 240 ||
        typeof input.confirmation !== 'string' ||
        input.confirmation !== 'CONFIRM_' + action.toUpperCase().replace(/-/g, '_') + '_' + id ||
        (action === 'confirm-accepted' && (
          typeof receipt !== 'string' || receipt.length < 8 || receipt.length > 300))) {
      return NextResponse.json({ code: 'EXPLICIT_CONFIRMATION_REQUIRED' }, { status: 400 });
    }
    const evidenceHash = typeof receipt === 'string'
      ? createHash('sha256').update(receipt).digest('hex') : null;
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.erpJobDelivery.findUnique({
        where: { id },
        select: {
          id: true, workspaceId: true, channel: true, eventKind: true,
          status: true, externalAttemptedAt: true, leaseExpiresAt: true,
          attempts: true,
        },
      });
      if (!row) throw new RecoveryConflict('NOT_FOUND');
      let status: 'PENDING' | 'PROVIDER_ACCEPTED' | 'SUPPRESSED';
      if (action === 'retry-pre-send') {
        const recoverable = row.externalAttemptedAt === null && row.attempts < 5 &&
          (row.status === 'FAILED' ||
            (row.status === 'CLAIMED' && row.leaseExpiresAt !== null &&
             row.leaseExpiresAt < now));
        if (!recoverable) throw new RecoveryConflict('NO_CONFIRMED_PRE_SEND_FAILURE');
        status = 'PENDING';
      } else if (action === 'confirm-accepted') {
        const expiredClaim = row.status === 'CLAIMED' && !!row.externalAttemptedAt &&
          !!row.leaseExpiresAt && row.leaseExpiresAt < now;
        if (row.status !== 'UNCERTAIN' && !expiredClaim) {
          throw new RecoveryConflict('NOT_AMBIGUOUS_PROVIDER_STATE');
        }
        status = 'PROVIDER_ACCEPTED';
      } else {
        const expiredClaim = row.status === 'CLAIMED' &&
          !!row.leaseExpiresAt && row.leaseExpiresAt < now;
        if (!['FAILED', 'UNCERTAIN'].includes(row.status) && !expiredClaim) {
          throw new RecoveryConflict('CANNOT_SUPPRESS_ACTIVE_DELIVERY');
        }
        status = 'SUPPRESSED';
      }
      const changed = await tx.erpJobDelivery.updateMany({
        where: {
          id, workspaceId: row.workspaceId, status: row.status,
          externalAttemptedAt: row.externalAttemptedAt,
          attempts: row.attempts,
          ...(row.status === 'CLAIMED' ? { leaseExpiresAt: { lt: now } } : {}),
        },
        data: {
          status,
          claimToken: null, leaseExpiresAt: null,
          lastErrorCode: status === 'PENDING' ? 'ADMIN_CONFIRMED_PRE_SEND_RETRY' :
            status === 'PROVIDER_ACCEPTED' ? 'ADMIN_PROVIDER_EVIDENCE_CONFIRMED' :
              'ADMIN_SUPPRESSED',
          ...(status === 'PENDING' ? { nextAttemptAt: now } : {}),
          ...(status === 'PROVIDER_ACCEPTED' ? {
            providerAckHash: evidenceHash, acceptedAt: now,
          } : {}),
        },
      });
      if (changed.count !== 1) throw new RecoveryConflict('CONCURRENT_DELIVERY_CHANGE');
      await tx.appActivityLog.create({
        data: {
          workspaceId: row.workspaceId, actorUserId: admin.userId,
          actorEmail: admin.email,
          action: 'erp.job_delivery.' + action,
          entityType: 'ErpJobDelivery', entityId: id,
          status: 'SUCCESS',
          metadata: {
            fromStatus: row.status, toStatus: status,
            kind: row.eventKind, channel: row.channel,
            // Keep sensitive provider receipts and free-text notes OUT of logs.
            reasonHash: createHash('sha256').update(reason).digest('hex'),
            evidenceHash,
          },
        },
      });
      return status;
    });
    return NextResponse.json({ ok: true, id, status: result },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RecoveryConflict) {
      return NextResponse.json({ code: error.message },
        { status: error.message === 'NOT_FOUND' ? 404 : 409, headers: { 'Cache-Control': 'no-store' } });
    }
    return handleAdminApiError(error, 'Delivery recovery action failed');
  }
}
