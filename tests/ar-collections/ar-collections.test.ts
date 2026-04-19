import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { parseFollowUpStatus, normalizeRiskScore } from '@/lib/ar-collections';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/workspace-scope', () => ({
  getActiveWorkspaceIdForUser: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({
  withPermission: vi.fn(),
}));

vi.mock('@/lib/modules', () => ({
  requireModule: vi.fn(),
  ModuleDisabledError: class ModuleDisabledError extends Error {
    moduleKey = 'AR_COLLECTIONS';
  },
}));

vi.mock('@/lib/ar-collections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ar-collections')>();
  return {
    ...actual,
    getArCollectionsSnapshot: vi.fn(),
    runReminderAutomation: vi.fn(),
  };
});

import { getServerSession } from 'next-auth';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';
import { withPermission } from '@/lib/rbac';
import { requireModule } from '@/lib/modules';
import { GET, POST } from '@/app/api/ar-collections/route';

describe('lib/ar-collections helpers', () => {
  it('normalizeRiskScore preserves zero', () => {
    expect(normalizeRiskScore(0)).toBe(0);
    expect(normalizeRiskScore(null)).toBe(50);
  });

  it('parseFollowUpStatus accepts known values only', () => {
    expect(parseFollowUpStatus('ESCALATED')).toBe('ESCALATED');
    expect(parseFollowUpStatus('INVALID')).toBeNull();
  });
});

describe('GET /api/ar-collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without user', async () => {
    (getServerSession as Mock).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when invoices.view denied', async () => {
    (getServerSession as Mock).mockResolvedValue({ user: { id: 'u1' } });
    (getActiveWorkspaceIdForUser as Mock).mockResolvedValue('ws1');
    (withPermission as Mock).mockResolvedValue({
      granted: false,
      response: NextResponse.json({ error: 'denied' }, { status: 403 }),
    });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(requireModule).not.toHaveBeenCalled();
  });

  it('calls requireModule when view granted', async () => {
    const { getArCollectionsSnapshot } = await import('@/lib/ar-collections');
    (getServerSession as Mock).mockResolvedValue({ user: { id: 'u1' } });
    (getActiveWorkspaceIdForUser as Mock).mockResolvedValue('ws1');
    (withPermission as Mock).mockResolvedValue({ granted: true, role: 'OWNER' });
    (getArCollectionsSnapshot as Mock).mockResolvedValue({
      rows: [],
      totals: {
        totalOutstanding: 0,
        overdueInvoices: 0,
        overdueAmount: 0,
        remindersSentLast7Days: 0,
      },
      buckets: [],
      workspace: { baseCurrency: 'INR', countryCode: 'IN' },
      smtpReminderReady: false,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(requireModule).toHaveBeenCalledWith('ws1', 'AR_COLLECTIONS');
    expect(getArCollectionsSnapshot).toHaveBeenCalledWith('ws1');
  });
});

describe('POST /api/ar-collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when invoices.edit denied', async () => {
    (getServerSession as Mock).mockResolvedValue({ user: { id: 'u1' } });
    (getActiveWorkspaceIdForUser as Mock).mockResolvedValue('ws1');
    (withPermission as Mock).mockResolvedValue({
      granted: false,
      response: NextResponse.json({ error: 'denied' }, { status: 403 }),
    });

    const req = new NextRequest('http://localhost/api/ar-collections', {
      method: 'POST',
      body: JSON.stringify({ action: 'RUN_REMINDERS' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
