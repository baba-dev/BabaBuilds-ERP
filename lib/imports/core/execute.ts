import { prisma } from '@/lib/prisma';
import { asDecimal } from '@/lib/imports/core/preview';
import type { ImportEntityKey, ImportExecutionMode, ImportPreview } from '@/lib/imports/core/types';

export async function executeImport(args: {
  workspaceId: string;
  actorUserId: string;
  preview: ImportPreview;
  mode: ImportExecutionMode;
}) {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of args.preview.rows) {
    if (row.issues.some((i) => i.severity === 'error')) {
      skipped += 1;
      continue;
    }
    const data = row.normalized;
    try {
      if (args.preview.entity === 'clients') {
        const name = String(data.name || '').trim();
        const email = String(data.email || '').trim() || null;
        const phone = String(data.phone || '').trim() || null;
        const existing = await prisma.client.findFirst({ where: { workspaceId: args.workspaceId, OR: [{ email: email || undefined }, { name, phone: phone || undefined }] } });
        if (existing && args.mode === 'create_only') { skipped += 1; continue; }
        if (existing) {
          await prisma.client.update({ where: { id: existing.id }, data: { name, email, phone, address: String(data.address || ''), country: String(data.country || ''), taxId: String(data.taxId || '') || null } });
          updated += 1;
        } else {
          await prisma.client.create({ data: { workspaceId: args.workspaceId, name, email, phone, address: String(data.address || ''), country: String(data.country || ''), taxId: String(data.taxId || '') || null } });
          imported += 1;
        }
      }

      if (args.preview.entity === 'services' || args.preview.entity === 'shop_items') {
        const name = String(data.name || '').trim();
        const existing = await prisma.serviceTemplate.findFirst({ where: { workspaceId: args.workspaceId, name } });
        if (existing && args.mode === 'create_only') { skipped += 1; continue; }
        const payload = {
          name,
          description: String(data.description || '') || null,
          defaultPrice: asDecimal(data.defaultPrice ?? data.price ?? 0),
          showInShop: args.preview.entity === 'shop_items' ? Boolean(data.active ?? true) : Boolean(data.active ?? true),
        };
        if (existing) {
          await prisma.serviceTemplate.update({ where: { id: existing.id }, data: payload });
          updated += 1;
        } else {
          await prisma.serviceTemplate.create({ data: { workspaceId: args.workspaceId, ...payload } });
          imported += 1;
        }
      }

      if (args.preview.entity === 'inventory') {
        const sku = String(data.sku || '').trim();
        const name = String(data.name || '').trim();
        const existing = await prisma.product.findUnique({ where: { sku_workspaceId: { sku, workspaceId: args.workspaceId } } });
        if (existing && args.mode === 'create_only') { skipped += 1; continue; }
        const payload = {
          sku,
          name,
          description: String(data.description || '') || null,
          category: String(data.category || '') || null,
          currentStock: Number(data.currentStock ?? 0),
          safetyStock: Number(data.reorderLevel ?? 5),
          costPrice: asDecimal(data.unitCost ?? 0),
          baselinePrice: asDecimal(data.sellingPrice ?? 0),
          status: Number(data.currentStock ?? 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        };
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data: payload });
          updated += 1;
        } else {
          await prisma.product.create({ data: { workspaceId: args.workspaceId, ...payload } });
          imported += 1;
        }
      }

      if (args.preview.entity === 'proposals') {
        const client = await prisma.client.findFirst({
          where: {
            workspaceId: args.workspaceId,
            OR: [
              { email: String(data.clientEmail || '') || undefined },
              { name: String(data.clientName || '') || undefined },
            ],
          },
        });
        if (!client) { skipped += 1; continue; }
        const proposalNo = String(data.proposalNo || `IMP-${Date.now()}-${row.rowNumber}`);
        const existing = await prisma.proposal.findUnique({ where: { proposalNo_workspaceId: { proposalNo, workspaceId: args.workspaceId } } });
        if (existing && args.mode === 'create_only') { skipped += 1; continue; }
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
          await prisma.proposal.update({ where: { id: existing.id }, data: payload });
          updated += 1;
        } else {
          await prisma.proposal.create({ data: { workspaceId: args.workspaceId, ...payload } });
          imported += 1;
        }
      }

      if (args.preview.entity === 'expenses') {
        const payload = {
          vendor: String(data.vendor || 'Unknown Vendor'),
          amount: asDecimal(data.amount ?? 0),
          category: String(data.category || 'Other'),
          description: String(data.description || '') || null,
          date: data.date ? new Date(String(data.date)) : new Date(),
        };
        await prisma.expense.create({ data: { workspaceId: args.workspaceId, ...payload } });
        imported += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    totalRowsParsed: args.preview.counts.parsed,
    imported,
    updated,
    skipped,
    failed,
    executedAt: new Date().toISOString(),
    actorUserId: args.actorUserId,
  };
}
