import { describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { aggregate } from '@/lib/reporting/semantic';
import { clientMetrics, listClients } from '@/lib/clients/queries';
import { loadPlatformOverview } from '@/lib/admin/overview';

let enabled = false;
try {
  const u = new URL(process.env.DATABASE_URL || '');
  enabled = process.env.CI_POSTGRES_FINANCE_TESTS === '1' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
    decodeURIComponent(u.pathname.slice(1)) === 'bababuilds_erp_ci';
} catch { /* explicitly disabled outside isolated PostgreSQL CI */ }

describe.runIf(enabled)('PostgreSQL runtime aggregation and CRM SQL', () => {
  it('executes invoices/expenses semantic SQL with date, enum, and numeric fidelity', async () => {
    const prisma = new PrismaClient();
    const tag = randomUUID();
    const workspace = await prisma.workspace.create({ data: { name: 'pg-runtime-' + tag } });
    const now = new Date('2026-11-15T12:00:00.000Z');
    const client = await prisma.client.create({
      data: { workspaceId: workspace.id, name: 'Client ' + tag, address: 'Test', country: 'IN' }
    });
    try {
      await prisma.invoice.create({ data: {
        workspaceId: workspace.id, invoiceNumber: 'TEST-' + tag, financialYear: '2026-27',
        invoiceDate: now, clientId: client.id, clientName: client.name,
        serviceDescription: 'PG test', totalAmount: new Prisma.Decimal('100'),
        grandTotal: new Prisma.Decimal('100'), subtotal: new Prisma.Decimal('90'),
        taxAmount: new Prisma.Decimal('10'), exchangeRate: new Prisma.Decimal('1'),
        amountReceived: new Prisma.Decimal('20'), pdfPath: '/no-file',
      }});
      await prisma.expense.create({ data: {
        workspaceId: workspace.id, date: now, category: 'Operations',
        vendor: 'Vendor ' + tag, amount: new Prisma.Decimal('50'),
        itcStatus: 'ELIGIBLE', itcHeld: false, igstAmount: new Prisma.Decimal('5')
      }});
      const ctx = {
        workspaceId: workspace.id,
        range: { key: 'this_fy' as const,
                 from: new Date('2026-04-01T00:00:00Z'),
                 to: new Date('2027-04-01T00:00:00Z') }
      };
      const invoice = await aggregate(ctx, {
        dataset: 'invoices', measures: ['billed', 'outstanding', 'revenue', 'count'],
        dimension: 'month', filters: { status: ['PENDING'], client: 'Client ' + tag }
      });
      expect(invoice.rows).toHaveLength(1);
      expect(invoice.rows[0]).toMatchObject({
        month: '2026-11', billed: 100, outstanding: 80, revenue: 90, count: 1
      });
      const expenses = await aggregate(ctx, {
        dataset: 'expenses', measures: ['spendNet', 'itcClaimable', 'count'],
        dimension: 'quarter', filters: { status: ['PAID'], category: ['Operations'] }
      });
      expect(expenses.rows).toHaveLength(1);
      expect(expenses.rows[0]).toMatchObject({
        quarter: '2026-Q4', spendNet: 45, itcClaimable: 5, count: 1
      });
      const crm = await clientMetrics(workspace.id, [client.id], now);
      expect(crm.get(client.id)).toMatchObject({
        invoiceCount: 1, billed: 100, outstanding: 80
      });
      const clientSearch = await listClients(workspace.id, {
        q: `CLIENT ${tag.toUpperCase()}`,
      }, now);
      expect(clientSearch.data.map((row) => row.id)).toContain(client.id);
      const platform = await loadPlatformOverview(new Date('2026-11-16T00:00:00Z'));
      expect(platform.invoices.gmvAll).toBeGreaterThanOrEqual(100);
      expect(platform.invoices.total).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.$disconnect();
    }
  }, 60000);
});
