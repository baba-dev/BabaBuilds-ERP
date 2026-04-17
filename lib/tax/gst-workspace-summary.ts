import type { PrismaClient } from '@prisma/client';

export type GstWorkspaceSummary = {
  financialYear: string;
  invoiceCount: number;
  taxableSupplyApprox: number;
  taxChargedApprox: number;
  topSacCodes: Array<{ sacCode: string; invoiceCount: number; taxAmount: number }>;
};

function inferIndianFYLabel(asOf: Date): string {
  const y = asOf.getFullYear();
  const m = asOf.getMonth() + 1;
  if (m <= 3) {
    const start = y - 1;
    return `${String(start).slice(-2)}-${String(y).slice(-2)}`;
  }
  return `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
}

function fyRange(fyLabel: string): { start: Date; end: Date } | null {
  const parts = fyLabel.split('-');
  if (parts.length !== 2) return null;
  const a = 2000 + parseInt(parts[0], 10);
  const b = 2000 + parseInt(parts[1], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const start = new Date(Date.UTC(a, 3, 1, 0, 0, 0));
  const end = new Date(Date.UTC(b, 2, 31, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Lightweight GSTR-1 style pilot: aggregate invoices in FY by SAC prefix (first 4 chars).
 */
export async function getGstWorkspaceSummary(
  prisma: PrismaClient,
  workspaceId: string,
  asOf: Date = new Date(),
): Promise<GstWorkspaceSummary> {
  const fyLabel = inferIndianFYLabel(asOf);
  const range = fyRange(fyLabel);
  if (!range) {
    return { financialYear: fyLabel, invoiceCount: 0, taxableSupplyApprox: 0, taxChargedApprox: 0, topSacCodes: [] };
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      invoiceDate: { gte: range.start, lte: range.end },
    },
    select: {
      id: true,
      sacCode: true,
      subtotal: true,
      taxAmount: true,
    },
  });

  let taxableSupplyApprox = 0;
  let taxChargedApprox = 0;
  const bySac = new Map<string, { count: number; tax: number }>();

  for (const inv of invoices) {
    const sub = Number(inv.subtotal ?? 0);
    const tax = Number(inv.taxAmount ?? 0);
    taxableSupplyApprox += sub;
    taxChargedApprox += tax;
    const raw = (inv.sacCode ?? '').trim();
    const sacKey = raw.slice(0, 6) || 'UNKNOWN';
    const prev = bySac.get(sacKey) ?? { count: 0, tax: 0 };
    bySac.set(sacKey, { count: prev.count + 1, tax: prev.tax + tax });
  }

  const topSacCodes = Array.from(bySac.entries())
    .map(([sacCode, v]) => ({ sacCode, invoiceCount: v.count, taxAmount: v.tax }))
    .sort((a, b) => b.taxAmount - a.taxAmount)
    .slice(0, 8);

  return {
    financialYear: fyLabel,
    invoiceCount: invoices.length,
    taxableSupplyApprox,
    taxChargedApprox,
    topSacCodes,
  };
}
