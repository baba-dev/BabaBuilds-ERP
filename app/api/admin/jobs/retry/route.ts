import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';
import { loadErpJobsConfig } from '@/lib/jobs/config';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

export const runtime = 'nodejs';
const body = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/) });

export async function POST(request: Request) {
  try {
    const admin = await verifySuperAdmin();
    const allowed = await enforceRouteRateLimit({
      request, route: '/api/admin/jobs/retry', scope: 'admin-jobs-retry',
      max: 20, windowMs: 600_000,
    });
    if (!allowed.ok) return allowed.response;
    const input = body.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ code: 'INVALID_ID' }, { status: 422 });
    const row = await prisma.erpJobOutbox.findUnique({
      where: { id: input.data.id }, select: { id: true, kind: true, status: true, workspaceId: true },
    });
    if (!row || row.status !== 'FAILED' || row.kind !== 'inapp_task_deadline_v1') {
      return NextResponse.json({ code: 'NOT_RETRYABLE' }, { status: 409 });
    }
    const config = loadErpJobsConfig();
    if (!config.enabled || !config.endpoint || !config.workerEnabled) {
      return NextResponse.json({ code: 'WORKER_DISABLED' }, { status: 503 });
    }
    const url = new URL(config.endpoint);
    const q = new Queue('internal-inapp', {
      prefix: config.namespace + ':jobs',
      connection: {
        host: '127.0.0.1', port: 6387, username: 'erp_jobs',
        password: decodeURIComponent(url.password),
        connectTimeout: 1200, maxRetriesPerRequest: 1,
      },
    });
    q.on('error', () => undefined);
    try {
      const failedJob = await q.getJob(row.id);
      if (failedJob) {
        if ((await failedJob.getState()) !== 'failed') {
          return NextResponse.json({ code: 'JOB_NOT_FAILED' }, { status: 409 });
        }
        await failedJob.remove(); // Once removed, DB outbox remains authoritative.
      }
    } catch {
      return NextResponse.json({ code: 'QUEUE_UNAVAILABLE' }, { status: 503 });
    } finally {
      await q.close().catch(() => undefined);
    }
    const updated = await prisma.erpJobOutbox.updateMany({
      where: { id: row.id, status: 'FAILED' },
      data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0, lastError: null },
    });
    if (!updated.count) return NextResponse.json({ code: 'RACE_RETRY' }, { status: 409 });
    await logActivity({
      action: 'admin_job_retry', status: 'SUCCESS', workspaceId: row.workspaceId,
      actor: { userId: admin.userId, email: admin.email },
      entity: { type: 'erp_job_outbox', id: row.id }, metadata: { kind: row.kind },
      request,
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    return handleAdminApiError(error, 'Job retry unavailable');
  }
}
