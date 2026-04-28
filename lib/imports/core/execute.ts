import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { asDecimal } from '@/lib/imports/core/preview';
import type { ImportExecutionMode, ImportPreview } from '@/lib/imports/core/types';

type SummaryRowError = { rowNumber: number; message: string };

async function processRow(args: {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  preview: ImportPreview;
  row: ImportPreview['rows'][number];
  mode: ImportExecutionMode;
}) {
  const { tx, workspaceId, preview, row, mode } = args;
  const data = row.normalized;

  if (preview.entity === 'clients') {
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim() || null;
    const phone = String(data.phone || '').trim() || null;
    const existing = await tx.client.findFirst({
      where: {
        workspaceId,
        OR: [
          ...(email ? [{ email }] : []),
          ...(name ? [{ name, phone: phone || undefined }] : []),
        ],
      },
    });

    if (existing && mode === 'create_only') return 'skipped' as const;
    if (existing) {
      await tx.client.update({ where: { id: existing.id }, data: { name, email, phone, address: String(data.address || ''), country: String(data.country || ''), taxId: String(data.taxId || '') || null } });
      return 'updated' as const;
    }

    await tx.client.create({ data: { workspaceId, name, email, phone, address: String(data.address || ''), country: String(data.country || ''), taxId: String(data.taxId || '') || null } });
    return 'imported' as const;
  }

  if (preview.entity === 'services') {
    const name = String(data.name || '').trim();
    const existing = await tx.serviceTemplate.findFirst({ where: { workspaceId, name } });
    if (existing && mode === 'create_only') return 'skipped' as const;

    const payload = {
      name,
      description: String(data.description || '') || null,
      defaultPrice: asDecimal(data.defaultPrice ?? data.price ?? 0),
      // Service templates are no longer sold directly in Shop.
    };

    if (existing) {
      await tx.serviceTemplate.update({ where: { id: existing.id }, data: payload });
      return 'updated' as const;
    }

    await tx.serviceTemplate.create({ data: { workspaceId, ...payload } });
    return 'imported' as const;
  }

  if (preview.entity === 'inventory' || preview.entity === 'shop_items') {
    const sku = String(data.sku || '').trim();
    const name = String(data.name || '').trim();
    const existing = await tx.product.findUnique({ where: { sku_workspaceId: { sku, workspaceId } } });
    if (existing && mode === 'create_only') return 'skipped' as const;

    const normalizedStock = Number(data.currentStock ?? data.stock ?? data.quantity ?? 0);
    const payload = {
      sku,
      name,
      description: String(data.description || '') || null,
      category: String(data.category || '') || null,
      currentStock: normalizedStock,
      safetyStock: Number(data.reorderLevel ?? 5),
      costPrice: asDecimal(data.unitCost ?? 0),
      baselinePrice: asDecimal(data.sellingPrice ?? data.price ?? 0),
      status: normalizedStock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      showInShop: preview.entity === 'shop_items' ? Boolean(data.isPublished ?? data.active ?? true) : undefined,
    };

    if (existing) {
      await tx.product.update({ where: { id: existing.id }, data: payload });
      return 'updated' as const;
    }

    await tx.product.create({ data: { workspaceId, ...payload } });
    return 'imported' as const;
  }

  if (preview.entity === 'proposals') {
    const email = String(data.clientEmail || '').trim();
    const clientName = String(data.clientName || '').trim();
    const client = await tx.client.findFirst({
      where: {
        workspaceId,
        OR: [
          ...(email ? [{ email }] : []),
          ...(clientName ? [{ name: clientName }] : []),
        ],
      },
    });
    if (!client) return 'skipped' as const;

    const proposalNo = String(data.proposalNo || `IMP-${Date.now()}-${row.rowNumber}`);
    const existing = await tx.proposal.findUnique({ where: { proposalNo_workspaceId: { proposalNo, workspaceId } } });
    if (existing && mode === 'create_only') return 'skipped' as const;

    const payload = {
      clientId: client.id,
      proposalNo,
      title: String(data.title || 'Imported Proposal'),
      status: String(data.status || 'DRAFT').toUpperCase(),
      dateCreated: data.dateCreated ? new Date(String(data.dateCreated)) : new Date(),
      validUntil: data.validUntil ? new Date(String(data.validUntil)) : new Date(Date.now() + 14 * 86400000),
      subtotal: asDecimal(data.totalAmount ?? 0),
      totalAmount: asDecimal(data.totalAmount ?? 0),
      estimatedTax: asDecimal(0),
    };

    if (existing) {
      await tx.proposal.update({ where: { id: existing.id }, data: payload });
      return 'updated' as const;
    }

    await tx.proposal.create({ data: { workspaceId, ...payload } });
    return 'imported' as const;
  }

  if (preview.entity === 'expenses') {
    await tx.expense.create({
      data: {
        workspaceId,
        vendor: String(data.vendor || 'Unknown Vendor'),
        amount: asDecimal(data.amount ?? 0),
        category: String(data.category || 'Other'),
        description: String(data.description || '') || null,
        date: data.date ? new Date(String(data.date)) : new Date(),
      },
    });
    return 'imported' as const;
  }

  return 'skipped' as const;
}

export async function executeImport(args: {
  workspaceId: string;
  actorUserId: string;
  preview: ImportPreview;
  mode: ImportExecutionMode;
  chunkSize?: number;
  onChunkCommitted?: (lastProcessedRow: number, counts: { imported: number; updated: number; skipped: number; failed: number }) => Promise<void>;
}) {
  const chunkSize = args.chunkSize ?? 150;
  let imported = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errorRows: SummaryRowError[] = [];

  const executableRows = args.preview.rows.filter((row) => !row.issues.some((i) => i.severity === 'error'));

  for (let i = 0; i < executableRows.length; i += chunkSize) {
    const chunk = executableRows.slice(i, i + chunkSize);

    await prisma.$transaction(async (tx) => {
      for (const row of chunk) {
        try {
          const status = await processRow({ tx: tx as Prisma.TransactionClient, workspaceId: args.workspaceId, preview: args.preview, row, mode: args.mode });
          if (status === 'imported') imported += 1;
          if (status === 'updated') updated += 1;
          if (status === 'skipped') skipped += 1;
        } catch (error) {
          failed += 1;
          errorRows.push({ rowNumber: row.rowNumber, message: error instanceof Error ? error.message : 'Unknown import error' });
        }
      }
    });

    if (args.onChunkCommitted) {
      await args.onChunkCommitted(i + chunk.length, { imported, updated, skipped, failed });
    }
  }

  skipped += args.preview.rows.length - executableRows.length;

  return {
    totalRowsParsed: args.preview.counts.parsed,
    imported,
    updated,
    skipped,
    failed,
    errorRows,
    lastProcessedRow: executableRows.length,
    executedAt: new Date().toISOString(),
    actorUserId: args.actorUserId,
  };
}
