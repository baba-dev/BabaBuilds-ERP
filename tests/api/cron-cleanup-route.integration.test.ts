import { beforeEach, describe, expect, it, vi } from 'vitest';

type WorkspaceRow = {
  id: string;
  name: string;
  isDemo: boolean;
  demoTemplateKey: string | null;
  demoExpiresAt: Date | null;
  createdAt: Date;
};

const { state, countSpy, findFirstSpy, deleteManySpy } = vi.hoisted(() => {
  const internalState: { workspaces: WorkspaceRow[] } = { workspaces: [] };

  const matchesDemoWhere = (row: WorkspaceRow, where: Record<string, unknown>): boolean => {
    const isDemo = where.isDemo;
    const demoTemplateKey = where.demoTemplateKey as { not: null } | undefined;
    const demoExpiresAt = where.demoExpiresAt as { lt: Date } | undefined;

    if (isDemo !== undefined && row.isDemo !== isDemo) return false;
    if (demoTemplateKey?.not === null && row.demoTemplateKey === null) return false;
    if (demoExpiresAt?.lt && (!row.demoExpiresAt || row.demoExpiresAt >= demoExpiresAt.lt)) return false;

    return true;
  };

  return {
    state: internalState,
    countSpy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return internalState.workspaces.filter((row) => matchesDemoWhere(row, where)).length;
    }),
    findFirstSpy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const candidates = internalState.workspaces
        .filter((row) => matchesDemoWhere(row, where))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      return candidates[0] ? { createdAt: candidates[0].createdAt } : null;
    }),
    deleteManySpy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = internalState.workspaces.length;
      internalState.workspaces = internalState.workspaces.filter((row) => !matchesDemoWhere(row, where));
      return { count: before - internalState.workspaces.length };
    }),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: {
      count: countSpy,
      findFirst: findFirstSpy,
      deleteMany: deleteManySpy,
    },
    taxRateOverrideAuditLog: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    taxDecisionAuditLog: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    fileImportAuditLog: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

vi.mock('@/lib/security/cron-auth', () => ({
  isCronAuthorized: vi.fn(() => true),
  unauthorizedCronResponse: vi.fn(() => new Response('Unauthorized', { status: 401 })),
}));

import { GET } from '@/app/api/cron/cleanup/route';

describe('cron cleanup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.workspaces = [];
    delete process.env.NODE_ENV;
  });

  it('does not delete a non-demo workspace even when named like demo', async () => {
    const now = Date.now();
    state.workspaces = [
      {
        id: 'real-1',
        name: 'BabaBuilds Demo Enterprise',
        isDemo: false,
        demoTemplateKey: null,
        demoExpiresAt: null,
        createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'demo-1',
        name: 'Anything',
        isDemo: true,
        demoTemplateKey: 'enterprise',
        demoExpiresAt: new Date(now - 2 * 60 * 60 * 1000),
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      },
    ];

    const response = await GET(new Request('https://example.com/api/cron/cleanup'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.purgedCount).toBe(1);
    expect(state.workspaces.map((workspace) => workspace.id)).toEqual(['real-1']);
  });

  it('supports dry-run via header and skips delete execution', async () => {
    const now = Date.now();
    state.workspaces = [
      {
        id: 'demo-2',
        name: 'BabaBuilds Demo Enterprise',
        isDemo: true,
        demoTemplateKey: 'enterprise',
        demoExpiresAt: new Date(now - 2 * 60 * 60 * 1000),
        createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      },
    ];

    const response = await GET(
      new Request('https://example.com/api/cron/cleanup', {
        headers: {
          'x-cleanup-dry-run': 'true',
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preview).toMatchObject({ candidateCount: 1, dryRun: true });
    expect(deleteManySpy).not.toHaveBeenCalled();
    expect(state.workspaces).toHaveLength(1);
  });

  it('requires explicit confirmation guard in production', async () => {
    process.env.NODE_ENV = 'production';

    const response = await GET(new Request('https://example.com/api/cron/cleanup'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('X-Confirm-Demo-Cleanup');
  });
});
