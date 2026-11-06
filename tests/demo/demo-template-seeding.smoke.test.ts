import { describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { seedDemoWorkspace } from '@/lib/demo/seed-workspace';
import { DEMO_TEMPLATE_KEYS, type DemoTemplateKey } from '@/lib/demo/templates';
import { MODULE_KEYS } from '@/lib/modules';

type MockedPrisma = typeof prisma & {
  [key: string]: {
    [method: string]: ReturnType<typeof vi.fn>;
  };
};

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      workspace: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
      companyGroup: { create: vi.fn() },
      companyGroupWorkspace: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      companyGroupMember: { upsert: vi.fn() },
      companyGroupModule: { upsert: vi.fn() },
      user: { update: vi.fn() },
      businessProfile: { create: vi.fn(), update: vi.fn() },
      client: { create: vi.fn(), findMany: vi.fn() },
      serviceTemplate: { createMany: vi.fn(), findMany: vi.fn() },
      product: { create: vi.fn() },
      proposal: { create: vi.fn() },
      invoice: { create: vi.fn() },
      expense: { createMany: vi.fn() },
      investment: { createMany: vi.fn() },
      retainer: { create: vi.fn() },
      workspaceModule: { upsert: vi.fn(), findMany: vi.fn() },
      // optional module tables used by seed hooks
      clientPaymentBehavior: { upsert: vi.fn() },
      inAppNotification: { create: vi.fn(), createMany: vi.fn() },
      cashForecastSnapshot: { create: vi.fn() },
      cashForecastPeriod: { create: vi.fn() },
      cashForecastManualAdjustment: { create: vi.fn(), createMany: vi.fn() },
      department: { create: vi.fn() },
      designation: { create: vi.fn() },
      employee: { create: vi.fn() },
      attendanceRecord: { create: vi.fn(), createMany: vi.fn() },
      payrollPeriod: { create: vi.fn() },
      payrollRun: { create: vi.fn() },
      document: { create: vi.fn() },
      documentFile: { create: vi.fn() },
      documentOcrJob: { create: vi.fn() },
      documentAuditEvent: { createMany: vi.fn() },
      taxPeriod: { create: vi.fn() },
      taxForm: { create: vi.fn() },
      taxReturn: { create: vi.fn() },
      taxReadinessCheck: { upsert: vi.fn() },
      taxReadinessBlocker: { create: vi.fn() },
      mailBillingPlan: { create: vi.fn() },
      mailBillingServer: { create: vi.fn() },
      mailBillingDomain: { create: vi.fn() },
      mailBillingMailbox: { create: vi.fn() },
      mailBillingSubscription: { create: vi.fn() },
      mailBillingReviewItem: { create: vi.fn() },
      mailBillingSettings: { upsert: vi.fn() },
    },
  };
});

describe('demo templates seeding', () => {
  it.each(DEMO_TEMPLATE_KEYS)('enables all optional modules for %s', async (templateKey) => {
    const key = templateKey as DemoTemplateKey;

    const tx = prisma as MockedPrisma;
    tx.workspace.create.mockResolvedValue({ id: 'ws_1' });
    tx.workspace.findUnique.mockResolvedValue({
      id: 'ws_1',
      name: 'Demo Co',
      subscriptionStatus: 'TRIALING',
      subscriptionEndsAt: null,
      planTier: 'PRO',
    });
    tx.companyGroupWorkspace.findFirst.mockResolvedValue(null);
    tx.companyGroup.create.mockResolvedValue({ id: 'cg_1' });
    tx.companyGroupWorkspace.create.mockResolvedValue({ id: 'cgw_1' });
    tx.companyGroupMember.upsert.mockResolvedValue({ id: 'cgm_1' });
    tx.companyGroupModule.upsert.mockResolvedValue({ id: 'cgmod_1' });
    tx.client.create.mockResolvedValue({ id: 'client_1' });
    tx.client.findMany.mockResolvedValue([{ id: 'client_1', name: 'Client 1' }]);
    tx.serviceTemplate.findMany.mockResolvedValue([
      { id: 'srv_1', name: 'S1', defaultPrice: 1, description: 'd' },
    ]);
    tx.workspaceModule.findMany.mockResolvedValue(MODULE_KEYS.map((moduleKey) => ({ moduleKey })));
    tx.payrollPeriod.create.mockResolvedValue({ id: 'pp_1' });
    tx.payrollRun.create.mockResolvedValue({ id: 'pr_1' });
    tx.employee.create.mockResolvedValue({ id: 'emp_1', firstName: 'A', lastName: 'B', email: 'a@b.com' });
    tx.department.create.mockResolvedValue({ id: 'dept_1' });
    tx.designation.create.mockResolvedValue({ id: 'desg_1' });
    tx.document.create.mockResolvedValue({ id: 'doc_1' });
    tx.documentFile.create.mockResolvedValue({ id: 'file_1' });
    tx.taxPeriod.create.mockResolvedValue({ id: 'tp_1' });
    tx.taxForm.create.mockResolvedValue({ id: 'tf_1' });
    tx.taxReturn.create.mockResolvedValue({ id: 'tr_1' });
    tx.taxReadinessCheck.upsert.mockResolvedValue({ id: 'tc_1' });
    tx.cashForecastSnapshot.create.mockResolvedValue({ id: 'cfs_1' });
    tx.mailBillingPlan.create.mockResolvedValue({ id: 'email_plan_1' });
    tx.mailBillingServer.create.mockResolvedValue({ id: 'email_server_1' });
    tx.mailBillingDomain.create.mockResolvedValue({ id: 'email_domain_1' });

    const result = await seedDemoWorkspace(tx, { userId: 'u_1', templateKey: key, ttlHours: 24 });

    expect(result.templateKey).toBe(key);
    expect(tx.workspaceModule.upsert).toHaveBeenCalled();
    // At least once per module
    expect(tx.workspaceModule.upsert.mock.calls.length).toBeGreaterThanOrEqual(MODULE_KEYS.length);
    // MULTI_COMPANY needs the company group wrapper, not just the module flag
    expect(tx.companyGroup.create).toHaveBeenCalled();
    expect(tx.companyGroupModule.upsert).toHaveBeenCalled();
  });
});

