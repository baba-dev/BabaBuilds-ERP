import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadGstProfile } from '@/lib/gst/data';
import { normalizeExpenseGst } from '@/lib/gst/expense-gst';
import { normalizeGstin, validateGstin } from '@/lib/gst/gstin';
import { isStateCode } from '@/lib/gst/states';
import { resolveVendor } from '@/lib/expenses/vendors';
import { deadStock, reorderSuggestions, stockStatus, summarizeStock, weightedAverageCost, type StockProduct } from './stock';

export class InventoryError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'CONFLICT' | 'INVALID_STATE' | 'OVER_RECEIPT' | 'DUPLICATE_SKU' | 'GSTIN_INVALID' | 'VALIDATION',
    message: string,
    readonly meta: Record<string, string | number> = {},
  ) {
    super(message);
  }
}

type Tx = Prisma.TransactionClient;
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);

/**
 * Changes stock atomically. Removing stock only succeeds while enough is on hand (unless allowed to go
 * negative), as one conditional update, so two people selling the last unit cannot both succeed. The status
 * and the movement record are written in the same transaction, with the balance after the change.
 */
export async function applyStockChange(
  tx: Tx,
  args: { workspaceId: string; productId: string; delta: number; type: 'IN' | 'OUT' | 'ADJ'; reason: string; referenceId?: string | null; unitCost?: number | null; userId?: string | null; allowNegative?: boolean },
) {
  const { workspaceId, productId, delta } = args;
  const found = await tx.product.findFirst({ where: { id: productId, workspaceId }, select: { id: true, name: true, currentStock: true, safetyStock: true } });
  if (!found) throw new InventoryError('NOT_FOUND', 'Product not found.');
  const moved = await tx.product.updateMany({
    where: { id: productId, workspaceId, ...(delta < 0 && !args.allowNegative ? { currentStock: { gte: -delta } } : {}) },
    data: { currentStock: { increment: delta } },
  });
  if (moved.count === 0) throw new InventoryError('INSUFFICIENT_STOCK', `Not enough ${found.name} in stock.`, { available: found.currentStock, requested: -delta });
  const after = await tx.product.findFirstOrThrow({ where: { id: productId, workspaceId }, select: { currentStock: true, safetyStock: true } });
  await tx.product.update({ where: { id: productId }, data: { status: stockStatus(after.currentStock, after.safetyStock) } });
  const movement = await tx.inventoryMovement.create({
    data: { workspaceId, productId, type: args.type, quantity: delta, reason: args.reason, referenceId: args.referenceId ?? null, unitCost: args.unitCost != null ? D(args.unitCost) : null, balanceAfter: after.currentStock, createdByUserId: args.userId ?? null },
  });
  return { balance: after.currentStock, movement };
}

/** Sets stock to a counted figure by recording the difference, so the trail shows what changed and why. */
export async function applyStockCount(tx: Tx, args: { workspaceId: string; productId: string; counted: number; reason: string; userId?: string | null }) {
  const p = await tx.product.findFirst({ where: { id: args.productId, workspaceId: args.workspaceId }, select: { currentStock: true } });
  if (!p) throw new InventoryError('NOT_FOUND', 'Product not found.');
  const delta = args.counted - p.currentStock;
  if (delta === 0) return { balance: p.currentStock, movement: null, delta: 0 };
  const r = await applyStockChange(tx, { workspaceId: args.workspaceId, productId: args.productId, delta, type: 'ADJ', reason: args.reason, userId: args.userId, allowNegative: true });
  return { ...r, delta };
}

export async function nextPoNumber(workspaceId: string): Promise<string> {
  const last = await prisma.purchaseOrder.findMany({ where: { workspaceId }, select: { poNumber: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  const max = last.reduce((m, r) => Math.max(m, Number(/(\d+)$/.exec(r.poNumber)?.[1] ?? 0)), 0);
  return `PO-${String(max + 1).padStart(4, '0')}`;
}

export async function createPurchaseOrder(args: { workspaceId: string; userId: string; input: import('zod').infer<typeof import('./schemas').poCreateSchema> }) {
  const { workspaceId, userId, input } = args;
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({ where: { workspaceId, id: { in: ids }, archivedAt: null }, select: { id: true, hsnCode: true, gstRate: true } });
  if (products.length !== ids.length) throw new InventoryError('NOT_FOUND', 'One of the products is no longer available.');
  const gstin = normalizeGstin(input.supplierGstin) || null;
  if (gstin && !validateGstin(gstin).valid) throw new InventoryError('GSTIN_INVALID', 'The supplier GSTIN is not valid.');
  const byId = new Map(products.map((p) => [p.id, p]));
  const total = input.lines.reduce((s, l) => s.plus(D(l.unitPrice).mul(l.quantity)), D(0));
  const expectedPaymentDate = input.paymentTermsDays != null && input.paymentTermsDays > 0 ? new Date(Date.now() + input.paymentTermsDays * 86_400_000) : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const poNumber = await nextPoNumber(workspaceId);
    try {
      return await prisma.purchaseOrder.create({
        data: {
          workspaceId, poNumber, supplier: input.supplier, vendorId: input.vendorId, supplierGstin: gstin, supplierStateCode: gstin ? null : input.supplierStateCode && isStateCode(input.supplierStateCode) ? input.supplierStateCode : null,
          status: input.send ? 'SENT' : 'DRAFT', sentAt: input.send ? new Date() : null, expectedDate: input.expectedDate, paymentTermsDays: input.paymentTermsDays, expectedPaymentDate, notes: input.notes, createdByUserId: userId, totalAmount: total,
          items: { create: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: D(l.unitPrice), expectedTotal: D(l.unitPrice).mul(l.quantity), gstRate: l.gstRate ?? byId.get(l.productId)?.gstRate ?? null, hsnCode: l.hsnCode ?? byId.get(l.productId)?.hsnCode ?? null })) },
        },
        include: { items: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // number taken by a concurrent create
      throw e;
    }
  }
  throw new InventoryError('CONFLICT', 'Could not allocate a purchase order number. Please try again.');
}

/**
 * Receives goods against a purchase order, in full or in parts. Each line is claimed with a compare-and-set on the
 * quantity already received, so pressing the button twice (or two people at once) cannot add the stock twice.
 * Stock, the movement trail, the weighted-average cost, the line and order status, and the purchase bill all
 * change in one transaction.
 */
export async function receivePurchaseOrder(args: { workspaceId: string; userId: string; poId: string; input: import('zod').infer<typeof import('./schemas').receiveSchema> }) {
  const { workspaceId, userId, poId, input } = args;
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, workspaceId }, include: { items: true } });
  if (!po) throw new InventoryError('NOT_FOUND', 'Purchase order not found.');
  if (po.status === 'CANCELLED') throw new InventoryError('INVALID_STATE', 'This purchase order is cancelled.');
  if (po.status === 'DELIVERED') throw new InventoryError('INVALID_STATE', 'This purchase order has already been received in full.');

  const wanted = input.lines?.length ? input.lines : po.items.filter((i) => i.quantity > i.receivedQuantity).map((i) => ({ itemId: i.id, quantity: i.quantity - i.receivedQuantity }));
  const itemById = new Map(po.items.map((i) => [i.id, i]));
  for (const l of wanted) {
    const item = itemById.get(l.itemId);
    if (!item) throw new InventoryError('NOT_FOUND', 'That line is not on this purchase order.');
    if (l.quantity > item.quantity - item.receivedQuantity) throw new InventoryError('OVER_RECEIPT', 'You cannot receive more than was ordered.', { outstanding: item.quantity - item.receivedQuantity, requested: l.quantity });
  }
  if (wanted.length === 0) throw new InventoryError('INVALID_STATE', 'Nothing is outstanding on this purchase order.');

  const supplierGstin = normalizeGstin(input.supplierGstin ?? po.supplierGstin) || null;
  if (supplierGstin && !validateGstin(supplierGstin).valid) throw new InventoryError('GSTIN_INVALID', 'The supplier GSTIN is not valid.');
  const supplierInvoiceNo = (input.supplierInvoiceNo ?? po.supplierInvoiceNo) || null;
  const chosenState = input.supplierStateCode ?? po.supplierStateCode;
  const gstCheck = validateGstin(supplierGstin);
  const vendorState = gstCheck.valid ? gstCheck.stateCode : chosenState && isStateCode(chosenState) ? chosenState : null;

  const products = await prisma.product.findMany({ where: { workspaceId, id: { in: po.items.map((i) => i.productId) } }, select: { id: true, hsnCode: true, gstRate: true } });
  const productById = new Map(products.map((p) => [p.id, p]));
  const gstProfile = input.syncExpense ? await loadGstProfile(workspaceId) : null;
  const vendorRow = input.syncExpense ? await resolveVendor(prisma, workspaceId, po.supplier, { gstin: supplierGstin, stateCode: vendorState, category: 'Inventory Restock' }) : null;

  return prisma.$transaction(async (tx) => {
    const received: { productId: string; quantity: number; unitCost: number; net: number; item: (typeof po.items)[number] }[] = [];
    for (const l of wanted) {
      const item = itemById.get(l.itemId)!;
      const claimed = await tx.purchaseOrderItem.updateMany({ where: { id: item.id, receivedQuantity: item.receivedQuantity }, data: { receivedQuantity: { increment: l.quantity } } });
      if (claimed.count === 0) throw new InventoryError('CONFLICT', 'This purchase order was just received by someone else. Reload and check what is outstanding.');
      const p = await tx.product.findFirst({ where: { id: item.productId, workspaceId }, select: { currentStock: true, costPrice: true } });
      if (!p) throw new InventoryError('NOT_FOUND', 'A product on this order no longer exists.');
      const unitCost = Number(item.unitPrice);
      const newCost = weightedAverageCost({ stock: p.currentStock, cost: Number(p.costPrice), qty: l.quantity, unitCost });
      await applyStockChange(tx, { workspaceId, productId: item.productId, delta: l.quantity, type: 'IN', reason: `PO ${po.poNumber} received`, referenceId: po.id, unitCost, userId });
      await tx.product.update({ where: { id: item.productId }, data: { costPrice: D(newCost) } });
      received.push({ productId: item.productId, quantity: l.quantity, unitCost, net: unitCost * l.quantity, item });
    }

    const lines = await tx.purchaseOrderItem.findMany({ where: { poId }, select: { quantity: true, receivedQuantity: true } });
    const complete = lines.every((x) => x.receivedQuantity >= x.quantity);
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: complete ? 'DELIVERED' : 'PARTIAL', supplierGstin, supplierInvoiceNo, supplierStateCode: vendorState, ...(complete ? { receivedAt: new Date() } : {}) } });

    let billed = 0;
    if (input.syncExpense && gstProfile) {
      const onCredit = (po.paymentTermsDays ?? 0) > 0 || Boolean(po.expectedPaymentDate);
      const billDate = new Date();
      const dueDate = onCredit ? po.expectedPaymentDate ?? new Date(billDate.getTime() + (po.paymentTermsDays ?? 0) * 86_400_000) : null;
      const link = { vendorId: vendorRow?.id ?? po.vendorId ?? null, purchaseOrderId: po.id, source: 'PO', dueDate };
      const paymentStatus = onCredit ? 'UNPAID' : 'PAID';
      // One bill per GST rate on the goods that arrived in this receipt.
      const groups = new Map<string, { rate: number | null; net: number; hsn: string | null }>();
      for (const r of received) {
        const product = productById.get(r.productId);
        const rate = r.item.gstRate ?? product?.gstRate ?? null;
        const key = rate === null ? 'none' : String(rate);
        const g = groups.get(key) ?? { rate, net: 0, hsn: r.item.hsnCode ?? product?.hsnCode ?? null };
        g.net += r.net;
        g.hsn = g.hsn ?? r.item.hsnCode ?? product?.hsnCode ?? null;
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const rate = g.rate ?? 0;
        const gross = Math.round(g.net * (1 + rate / 100) * 100) / 100;
        const gst = normalizeExpenseGst({ itcStatus: !!supplierGstin && rate > 0 ? 'ELIGIBLE' : 'NONE', paymentStatus, vendorGstin: supplierGstin, vendorInvoiceNo: supplierInvoiceNo, vendorStateCode: vendorState, hsnCode: g.hsn, gstRate: rate > 0 ? rate : null }, gross, gstProfile.stateCode);
        if (!gst.ok) throw new InventoryError('VALIDATION', gst.message);
        await tx.expense.create({ data: { workspaceId, vendor: po.supplier, amount: gross, category: 'Inventory Restock', description: `Goods received on PO ${po.poNumber}${rate > 0 ? ` (GST ${rate}%)` : ''}`, date: billDate, ...link, ...gst.data } });
        billed += 1;
      }
    }
    return { status: complete ? ('DELIVERED' as const) : ('PARTIAL' as const), receivedLines: received.length, units: received.reduce((s, r) => s + r.quantity, 0), bills: billed };
  }, { timeout: 30_000 });
}

/** Everything the overview needs, in a few queries. */
export async function loadInsights(workspaceId: string, now = new Date()) {
  const since90 = new Date(now.getTime() - 90 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [rows, sales, openLines] = await Promise.all([
    prisma.product.findMany({ where: { workspaceId, archivedAt: null }, take: 5000 }),
    prisma.inventoryMovement.findMany({ where: { workspaceId, type: 'OUT', createdAt: { gte: since90 } }, select: { productId: true, quantity: true, createdAt: true }, take: 50_000 }),
    prisma.purchaseOrderItem.findMany({ where: { purchaseOrder: { workspaceId, status: { in: ['SENT', 'PARTIAL', 'DRAFT'] } } }, select: { productId: true, quantity: true, receivedQuantity: true, purchaseOrder: { select: { status: true } } } }),
  ]);
  const products: StockProduct[] = rows.map((p) => ({ id: p.id, name: p.name, sku: p.sku, unit: p.unit, category: p.category, currentStock: p.currentStock, safetyStock: p.safetyStock, costPrice: Number(p.costPrice), baselinePrice: Number(p.baselinePrice), reorderQuantity: p.reorderQuantity, leadTimeDays: p.leadTimeDays, preferredVendorId: p.preferredVendorId, createdAt: p.createdAt }));
  const sold = new Map<string, { last30: number; last90: number }>();
  const lastSold = new Map<string, Date>();
  for (const m of sales) {
    const q = Math.abs(m.quantity);
    const cur = sold.get(m.productId) ?? { last30: 0, last90: 0 };
    cur.last90 += q;
    if (m.createdAt >= since30) cur.last30 += q;
    sold.set(m.productId, cur);
    if (!lastSold.has(m.productId) || m.createdAt > lastSold.get(m.productId)!) lastSold.set(m.productId, m.createdAt);
  }
  const onOrder = new Map<string, number>();
  for (const l of openLines) if (l.purchaseOrder.status !== 'DRAFT') onOrder.set(l.productId, (onOrder.get(l.productId) ?? 0) + Math.max(0, l.quantity - l.receivedQuantity));
  return { summary: summarizeStock(products), reorder: reorderSuggestions({ products, sold, onOrder }), dead: deadStock({ products, lastSold, now }), products };
}
