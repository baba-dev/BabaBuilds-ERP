/**
 * POST /api/cron/alerts/phase4-canary
 *
 * Operator-only Phase 4 producer canary. Unlike /api/cron/alerts, this route
 * NEVER scans other workspaces and NEVER dispatches email, push or legacy
 * notifications. It only records one eligible in-app task occurrence in PG.
 *
 * Requires CRON_SECRET and the existing one-workspace Phase 4 pilot switches.
 * No GET handler: automated global cron calls cannot accidentally enter here.
 */
import { NextResponse } from 'next/server';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { loadErpJobsConfig } from '@/lib/jobs/config';
import { recordDeadlineInAppJob } from '@/lib/jobs/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID = /^[A-Za-z0-9_-]{8,80}$/;
const headers = { 'Cache-Control': 'no-store' };

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();

  let pilot: ReturnType<typeof loadErpJobsConfig>;
  try {
    pilot = loadErpJobsConfig();
  } catch {
    return response('Phase 4 pilot configuration invalid', 503);
  }
  if (!pilot.enabled || !pilot.workerEnabled || !pilot.inAppDeadlineEnabled ||
      pilot.inAppDeadlineWorkspaceIds.length !== 1) {
    return response('Phase 4 pilot disabled', 409);
  }

  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return response('Expected JSON', 415);
  }
  // Operational endpoint with a tiny, strictly shaped command; never accept
  // bulk IDs, wildcards, another notification kind or user-supplied payload.
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 512)) {
    return response('Invalid request', 400);
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return response('Invalid request', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response('Invalid request', 400);
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).sort().join(',') !== 'taskId,workspaceId' ||
      typeof fields.workspaceId !== 'string' || !ID.test(fields.workspaceId) ||
      typeof fields.taskId !== 'string' || !ID.test(fields.taskId)) {
    return response('Invalid request', 400);
  }
  const workspaceId = fields.workspaceId;
  const taskId = fields.taskId;

  // A non-allowlisted request must not reveal the target workspace's existence.
  if (workspaceId !== pilot.inAppDeadlineWorkspaceIds[0]) {
    return response('Not found', 404);
  }
  try {
    const now = new Date();
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, subscriptionStatus: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    if (!workspace) return response('Not found', 404);
    const task = await prisma.task.findFirst({
      where: {
        id: taskId, workspaceId, status: { not: 'DONE' },
        dueDate: { gte: startOfDay(now), lte: endOfDay(addDays(now, 7)) },
      },
      select: { id: true, dueDate: true },
    });
    if (!task?.dueDate) return response('Not found', 404);

    // Require at least one currently active in-app recipient. The worker
    // independently rechecks membership, preferences and task state at delivery.
    const recipients = await prisma.workspaceUser.count({
      where: { workspaceId, isActive: true, user: { notifyInApp: true } },
    });
    if (recipients < 1) return response('No eligible recipients', 409);

    await recordDeadlineInAppJob({ workspaceId, taskId, dueDate: task.dueDate });
    return NextResponse.json({ status: 'queued-or-already-recorded' }, { status: 202, headers });
  } catch {
    // Commit outcome may be ambiguous: no legacy fallback or second attempt.
    return response('Phase 4 canary unavailable; inspect outbox before retry', 503);
  }
}
