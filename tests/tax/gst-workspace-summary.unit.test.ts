import { describe, expect, it } from 'vitest';
import { getGstWorkspaceSummary } from '@/lib/tax/gst-workspace-summary';
import { prisma } from '@/lib/prisma';

describe('getGstWorkspaceSummary', () => {
  it('returns empty summary when workspace has no invoices in FY window', async () => {
    const ws = await prisma.workspace.create({
      data: { name: 'GST summary test ws' },
    });
    try {
      const summary = await getGstWorkspaceSummary(prisma, ws.id, new Date('2026-04-15T00:00:00.000Z'));
      expect(summary.invoiceCount).toBe(0);
      expect(summary.topSacCodes).toEqual([]);
    } finally {
      await prisma.workspace.delete({ where: { id: ws.id } });
    }
  });
});
