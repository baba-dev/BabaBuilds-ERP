import { afterAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { prisma } from '@/lib/prisma';
import { recordDeadlineInAppJob } from '@/lib/jobs/outbox';

const live = process.env.CI_REDIS_JOBS_TESTS === '1';
const suite = live ? describe : describe.skip;

suite('Phase 4 real PostgreSQL 17 + Redis 7 worker', () => {
  let worker: ChildProcess | null = null;
  let workspaceId: string | null = null;
  let userId: string | null = null;

  async function until(check: () => Promise<boolean>, timeout = 22000) {
    const expiry = Date.now() + timeout;
    while (Date.now() < expiry) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    throw new Error('WORKER_WAIT_TIMEOUT');
  }

  afterAll(async () => {
    if (worker) {
      worker.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 500));
      if (worker.exitCode === null) worker.kill('SIGKILL');
    }
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => null);
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => null);
  }, 30000);

  it('replays persisted outbox and never double-writes or crosses tenants', async () => {
    const random = Math.random().toString(36).slice(2);
    const user = await prisma.user.create({
      data: { email: 'ci-jobs-' + random + '@example.invalid', notifyInApp: true },
    });
    userId = user.id;
    const ws = await prisma.workspace.create({
      data: { name: 'ERP Jobs CI ' + random, users: { create: { userId: user.id, role: 'OWNER' } } },
    });
    workspaceId = ws.id;
    const dueDate = new Date(Date.now() + 2 * 86400_000);
    const task = await prisma.task.create({
      data: { title: 'Internal job CI', workspaceId: ws.id, dueDate, status: 'PENDING' },
    });
    await recordDeadlineInAppJob({ workspaceId: ws.id, taskId: task.id, dueDate });
    await recordDeadlineInAppJob({ workspaceId: ws.id, taskId: task.id, dueDate });
    const pending = await prisma.erpJobOutbox.findMany({ where: { workspaceId: ws.id } });
    expect(pending).toHaveLength(1);

    worker = spawn(process.execPath, ['ops/erp-worker/worker.mjs'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ERP_REDIS_ENABLED: 'true',
        ERP_REDIS_JOBS_ENABLED: 'true',
        ERP_REDIS_JOB_WORKER_ENABLED: 'true',
        ERP_REDIS_INAPP_DEADLINE_ENABLED: 'true',
        ERP_REDIS_NAMESPACE: 'erp:ci:v1',
        ERP_REDIS_JOB_URL: 'redis://erp_jobs:ci-test-worker-only-password@127.0.0.1:6387/0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    worker.stdout?.on('data', chunk => { output += String(chunk); });
    worker.stderr?.on('data', chunk => { output += String(chunk); });
    await until(async () => output.includes('[erp-worker] READY') || worker?.exitCode !== null, 15000);
    expect(output).toContain('[erp-worker] READY');

    await until(async () => (await prisma.erpJobOutbox.findUnique({
      where: { id: pending[0].id }, select: { status: true },
    }))?.status === 'DONE');
    const count = () => prisma.inAppNotification.count({
      where: { workspaceId: ws.id, userId: user.id, eventType: 'DEADLINE_ALERT' },
    });
    expect(await count()).toBe(1);

    // A deliberately repeated outbox occurrence is still just one row.
    await recordDeadlineInAppJob({ workspaceId: ws.id, taskId: task.id, dueDate });
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(await count()).toBe(1);

    // Membership revoked after a future event must suppress delivery.
    await prisma.workspaceUser.update({
      where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } },
      data: { isActive: false },
    });
    const task2 = await prisma.task.create({
      data: { title: 'Revoked user', workspaceId: ws.id, dueDate, status: 'PENDING' },
    });
    await recordDeadlineInAppJob({ workspaceId: ws.id, taskId: task2.id, dueDate });
    await until(async () => (await prisma.erpJobOutbox.findFirst({
      where: { workspaceId: ws.id, dedupeKey: { contains: task2.id } },
      select: { status: true },
    }))?.status === 'DONE');
    expect(await count()).toBe(1);
  }, 30000);
});
