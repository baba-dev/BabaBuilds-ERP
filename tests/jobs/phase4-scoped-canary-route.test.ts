import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  authorized: vi.fn(),
  config: vi.fn(),
  workspace: vi.fn(),
  task: vi.fn(),
  recipients: vi.fn(),
  record: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/security/cron-auth', () => ({
  isCronAuthorized: m.authorized,
  unauthorizedCronResponse: () => new Response('Unauthorized', { status: 401 }),
}));
vi.mock('@/lib/jobs/config', () => ({ loadErpJobsConfig: m.config }));
vi.mock('@/lib/jobs/outbox', () => ({ recordDeadlineInAppJob: m.record }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findFirst: m.workspace },
    task: { findFirst: m.task },
    workspaceUser: { count: m.recipients },
  },
}));

import { POST } from '@/app/api/cron/alerts/phase4-canary/route';

const WORKSPACE = 'internalphase4ws0001';
const TASK = 'phase4task000000001';
const DUE = new Date(Date.now() + 2 * 86400_000);

const request = (body: unknown, extra?: Record<string, string>) => new Request(
  'https://erp.example.invalid/api/cron/alerts/phase4-canary',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret', ...extra },
    body: JSON.stringify(body),
  },
);

describe('Phase 4 scoped producer endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.authorized.mockReturnValue(true);
    m.config.mockReturnValue({
      enabled: true, workerEnabled: true, inAppDeadlineEnabled: true,
      inAppDeadlineWorkspaceIds: [WORKSPACE],
    });
    m.workspace.mockResolvedValue({ id: WORKSPACE });
    m.task.mockResolvedValue({ id: TASK, dueDate: DUE });
    m.recipients.mockResolvedValue(1);
    m.record.mockResolvedValue(undefined);
  });

  it('rejects missing cron authorization without reading config or DB', async () => {
    m.authorized.mockReturnValue(false);
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(401);
    expect(m.config).not.toHaveBeenCalled();
    expect(m.workspace).not.toHaveBeenCalled();
  });

  it('fails closed when any of the three rollout switches is off', async () => {
    for (const key of ['enabled', 'workerEnabled', 'inAppDeadlineEnabled'] as const) {
      m.config.mockReturnValueOnce({
        enabled: true, workerEnabled: true, inAppDeadlineEnabled: true,
        inAppDeadlineWorkspaceIds: [WORKSPACE], [key]: false,
      });
      expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(409);
    }
    expect(m.workspace).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });

  it('fails closed for invalid config, empty allowlist or multi-workspace allowlist', async () => {
    m.config.mockImplementationOnce(() => { throw new Error('invalid secret'); });
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(503);
    for (const ids of [[], [WORKSPACE, 'anotherworkspaceid']]) {
      m.config.mockReturnValueOnce({
        enabled: true, workerEnabled: true, inAppDeadlineEnabled: true,
        inAppDeadlineWorkspaceIds: ids,
      });
      expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(409);
    }
    expect(m.workspace).not.toHaveBeenCalled();
  });

  it('accepts only two exact ID fields, no wildcard, bulk or custom payload', async () => {
    const bad = [
      {}, { workspaceId: '*', taskId: TASK }, { workspaceId: WORKSPACE, taskId: TASK, kind: 'email' },
      { workspaceId: [WORKSPACE], taskId: TASK }, { workspaceId: WORKSPACE, taskId: '../task' },
    ];
    for (const body of bad) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }, {
      'content-type': 'text/plain',
    }))).status).toBe(415);
    expect(m.workspace).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });

  it('does not reveal or query another workspace', async () => {
    const res = await POST(request({ workspaceId: 'somecustomerworkspace', taskId: TASK }));
    expect(res.status).toBe(404);
    expect(m.workspace).not.toHaveBeenCalled();
    expect(m.task).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });

  it('requires eligible workspace, due task and active opted-in recipient', async () => {
    m.workspace.mockResolvedValueOnce(null);
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(404);
    m.task.mockResolvedValueOnce(null);
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(404);
    m.recipients.mockResolvedValueOnce(0);
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(409);
    expect(m.record).not.toHaveBeenCalled();
  });

  it('selects only the exact task, workspace, future due window and active members', async () => {
    const result = await POST(request({ workspaceId: WORKSPACE, taskId: TASK }));
    expect(result.status).toBe(202);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(m.workspace).toHaveBeenCalledWith({
      where: { id: WORKSPACE, subscriptionStatus: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    expect(m.task).toHaveBeenCalledWith({
      where: {
        id: TASK, workspaceId: WORKSPACE, status: { not: 'DONE' },
        dueDate: { gte: expect.any(Date), lte: expect.any(Date) },
      },
      select: { id: true, dueDate: true },
    });
    expect(m.recipients).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE, isActive: true, user: { notifyInApp: true } },
    });
    expect(m.record).toHaveBeenCalledExactlyOnceWith({ workspaceId: WORKSPACE, taskId: TASK, dueDate: DUE });
  });

  it('uses the existing idempotent outbox upsert even if the operator retries', async () => {
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(202);
    expect((await POST(request({ workspaceId: WORKSPACE, taskId: TASK }))).status).toBe(202);
    expect(m.record).toHaveBeenCalledTimes(2);
    expect(m.record).toHaveBeenNthCalledWith(2, { workspaceId: WORKSPACE, taskId: TASK, dueDate: DUE });
  });

  it('never falls back to legacy notification delivery on ambiguous outbox failure', async () => {
    m.record.mockRejectedValueOnce(new Error('db commit outcome unknown'));
    const result = await POST(request({ workspaceId: WORKSPACE, taskId: TASK }));
    expect(result.status).toBe(503);
    expect(m.record).toHaveBeenCalledTimes(1);
  });
});
