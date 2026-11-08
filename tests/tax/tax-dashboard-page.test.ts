import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const getServerSessionMock = vi.fn();
const getActiveWorkspaceIdForUserMock = vi.fn();
const isModuleEnabledMock = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/workspace-scope', () => ({
  getActiveWorkspaceIdForUser: getActiveWorkspaceIdForUserMock,
}));

vi.mock('@/lib/modules', () => ({
  isModuleEnabled: isModuleEnabledMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));

vi.mock('@/app/(dashboard)/tax/TaxDashboardClient', () => ({
  default: ({ taxAdvancedEnabled }: { taxAdvancedEnabled: boolean }) =>
    React.createElement('div', { 'data-tax-enabled': String(taxAdvancedEnabled) }),
}));

describe('income tax page server composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes enabled state to client component', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user_1' } });
    getActiveWorkspaceIdForUserMock.mockResolvedValue('ws_1');
    isModuleEnabledMock.mockResolvedValue(true);

    const { default: TaxDashboardPage } = await import('@/app/(dashboard)/tax/income-tax/page');
    const element = await TaxDashboardPage();

    expect(getActiveWorkspaceIdForUserMock).toHaveBeenCalledWith('user_1');
    expect(isModuleEnabledMock).toHaveBeenCalledWith('ws_1', 'TAX_ADVANCED');
    expect((element as { props: { taxAdvancedEnabled: boolean } }).props.taxAdvancedEnabled).toBe(true);
  });

  it('defaults to disabled when no active workspace is found', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user_1' } });
    getActiveWorkspaceIdForUserMock.mockResolvedValue(null);

    const { default: TaxDashboardPage } = await import('@/app/(dashboard)/tax/income-tax/page');
    const element = await TaxDashboardPage();

    expect(isModuleEnabledMock).not.toHaveBeenCalled();
    expect((element as { props: { taxAdvancedEnabled: boolean } }).props.taxAdvancedEnabled).toBe(false);
  });
});
