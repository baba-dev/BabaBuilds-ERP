import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { canonicalReportRecipients, reportQueueEnabled } from '@/lib/jobs/report-routing';
import { reportSourceFingerprint } from '@/lib/jobs/report-producer';
import { getReport, reportAllowed } from '@/lib/reporting/engine';
import { renderQueuedReportEmail } from '@/lib/reporting/scheduled-render';
import { checkPermissionSilent } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ID = /^[A-Za-z0-9_-]{8,100}$/;
const NO_CACHE = { 'Cache-Control': 'no-store' };

function workerAuthorized(id: string, claimToken: string, timestamp: number, signature: string): boolean {
  const hex = process.env.ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(hex) || !/^[a-fA-F0-9]{64}$/.test(signature) ||
      !ID.test(id) || !/^[a-fA-F0-9-]{36}$/.test(claimToken) ||
      !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 30_000) {
    return false;
  }
  const msg = 'erp-report-render-v1:' + id + ':' + claimToken + ':' + timestamp;
  const expected = createHmac('sha256', Buffer.from(hex, 'hex')).update(msg).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Worker-only render service. The standalone SMTP worker authenticates
 * with an HMAC bound to the claim token and a 30-second timestamp.
 * Sensitive PDF/CSV data is returned only over a loopback request; no
 * attachment bytes, credentials or email recipients enter BullMQ.
 */
export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json' ||
      Number(request.headers.get('content-length') || 0) > 512) {
    return NextResponse.json({ code: 'INVALID_WORKER_REQUEST' }, { status: 400, headers: NO_CACHE });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 512) throw new Error('LIMIT');
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ code: 'INVALID_WORKER_REQUEST' }, { status: 400, headers: NO_CACHE });
  }
  const id = body.id, claimToken = body.claimToken, timestamp = body.timestamp;
  if (typeof id !== 'string' || typeof claimToken !== 'string' ||
      typeof timestamp !== 'number' ||
      !workerAuthorized(id, claimToken, timestamp,
        request.headers.get('x-erp-report-signature') || '')) {
    return NextResponse.json({ code: 'NOT_AUTHORIZED' }, { status: 403, headers: NO_CACHE });
  }

  try {
    const delivery = await prisma.erpJobDelivery.findUnique({
      where: { id }, select: {
        id: true, workspaceId: true, eventKind: true, channel: true,
        occurrenceKey: true, status: true, claimToken: true,
        externalAttemptedAt: true, leaseExpiresAt: true,
      },
    });
    if (!delivery || delivery.eventKind !== 'scheduled_report_email_v1' ||
        delivery.channel !== 'REPORT_EMAIL' || delivery.status !== 'CLAIMED' ||
        delivery.claimToken !== claimToken || delivery.externalAttemptedAt !== null ||
        !delivery.leaseExpiresAt || delivery.leaseExpiresAt <= new Date() ||
        !reportQueueEnabled(delivery.workspaceId)) {
      return NextResponse.json({ code: 'REPORT_CLAIM_NOT_ELIGIBLE' },
        { status: 409, headers: NO_CACHE });
    }
    const source = await prisma.erpJobOutbox.findUnique({
      where: { workspaceId_kind_dedupeKey: {
        workspaceId: delivery.workspaceId,
        kind: 'scheduled_report_source_v1',
        dedupeKey: delivery.occurrenceKey,
      } },
      select: { status: true, payloadJson: true },
    });
    const data = source?.payloadJson as Record<string, unknown> | undefined;
    if (source?.status !== 'DONE' || data?.schema !== 1 ||
        typeof data.reportViewId !== 'string' || typeof data.scheduledAt !== 'string' ||
        typeof data.fingerprint !== 'string' ||
        typeof data.expectedRecipients !== 'number') {
      return NextResponse.json({ code: 'REPORT_SOURCE_GONE' }, { status: 409, headers: NO_CACHE });
    }
    const view = await prisma.reportView.findFirst({
      where: { id: data.reportViewId, workspaceId: delivery.workspaceId },
    });
    const recipients = canonicalReportRecipients(view?.scheduleRecipients);
    const creator = view?.createdByUserId ?? '';
    if (!view || !view.scheduleEnabled || !creator || !recipients ||
        recipients.length !== data.expectedRecipients ||
        reportSourceFingerprint(view) !== data.fingerprint ||
        !getReport(view.reportId)) {
      return NextResponse.json({ code: 'REPORT_SOURCE_CHANGED' }, { status: 409, headers: NO_CACHE });
    }
    const membership = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: creator, workspaceId: view.workspaceId } },
      select: { isActive: true },
    });
    const def = getReport(view.reportId);
    if (!membership?.isActive || !def ||
        !(await checkPermissionSilent(creator, view.workspaceId, 'reporting_center.view')) ||
        !(await reportAllowed(def, creator, view.workspaceId))) {
      return NextResponse.json({ code: 'REPORT_ACCESS_REVOKED' }, { status: 409, headers: NO_CACHE });
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: view.workspaceId }, select: { subscriptionStatus: true },
    });
    if (!workspace || workspace.subscriptionStatus === 'SUSPENDED') {
      return NextResponse.json({ code: 'REPORT_WORKSPACE_UNAVAILABLE' },
        { status: 409, headers: NO_CACHE });
    }
    const at = new Date(data.scheduledAt);
    if (!Number.isFinite(at.getTime())) {
      return NextResponse.json({ code: 'REPORT_SOURCE_INVALID' }, { status: 409, headers: NO_CACHE });
    }
    const result = await renderQueuedReportEmail(view, at);
    return NextResponse.json(result, { headers: NO_CACHE });
  } catch {
    // Never expose report contents, SMTP settings, query results or DB errors.
    return NextResponse.json({ code: 'REPORT_RENDER_FAILED' }, { status: 503, headers: NO_CACHE });
  }
}
