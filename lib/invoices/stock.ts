import type { Prisma } from "@prisma/client";
import { addInvoiceEvent } from "@/lib/invoices/events";

export class InvoiceStockError extends Error {
  constructor(public readonly productId: string, public readonly productName?: string) {
    super(`INVOICE_STOCK_COMMIT_FAILED:${productId}`);
    this.name = "InvoiceStockError";
  }
}

const inventoryStatusFor = (stock: number, safetyStock: number) =>
  stock <= 0 ? "OUT_OF_STOCK" : stock <= safetyStock ? "LOW_STOCK" : "IN_STOCK";

/**
 * Deducts stock for the invoice's product lines exactly once (guarded by Invoice.stockCommittedAt).
 * Policy: stock leaves when the invoice is ISSUED. Legacy invoices that were never committed are
 * committed at their first full payment as a fallback.
 * Throws InvoiceStockError (rolling back the surrounding transaction) when stock is insufficient.
 */
export async function commitInvoiceStock(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; invoiceId: string; actorUserId?: string | null },
): Promise<{ committed: boolean }> {
  const invoice = await tx.invoice.findFirst({
    where: { id: input.invoiceId, workspaceId: input.workspaceId },
    select: { id: true, stockCommittedAt: true, items: { select: { productId: true, quantity: true } } },
  });
  if (!invoice || invoice.stockCommittedAt) return { committed: false };

  // Claim first: a concurrent caller sees count 0 and does nothing.
  const claim = await tx.invoice.updateMany({
    where: { id: invoice.id, stockCommittedAt: null },
    data: { stockCommittedAt: new Date() },
  });
  if (claim.count === 0) return { committed: false };

  let movements = 0;
  for (const item of invoice.items) {
    if (!item.productId || item.quantity <= 0) continue;

    const updated = await tx.product.updateMany({
      where: { id: item.productId, workspaceId: input.workspaceId, currentStock: { gte: item.quantity } },
      data: { currentStock: { decrement: item.quantity } },
    });
    if (updated.count === 0) {
      const product = await tx.product.findFirst({ where: { id: item.productId }, select: { name: true } });
      throw new InvoiceStockError(item.productId, product?.name);
    }

    const refreshed = await tx.product.findUnique({
      where: { id: item.productId },
      select: { currentStock: true, safetyStock: true },
    });
    if (refreshed) {
      await tx.product.update({
        where: { id: item.productId },
        data: { status: inventoryStatusFor(refreshed.currentStock, refreshed.safetyStock) },
      });
    }

    const reason = `Invoice stock commit [invoice:${invoice.id}:${item.productId}]`;
    const existing = await tx.inventoryMovement.findFirst({
      where: { workspaceId: input.workspaceId, productId: item.productId, referenceId: invoice.id, reason },
      select: { id: true },
    });
    if (!existing) {
      await tx.inventoryMovement.create({
        data: {
          workspaceId: input.workspaceId,
          productId: item.productId,
          type: "OUT",
          quantity: -item.quantity,
          reason,
          referenceId: invoice.id,
        },
      });
      movements += 1;
    }
  }

  if (movements > 0) {
    await addInvoiceEvent(tx, {
      workspaceId: input.workspaceId,
      invoiceId: invoice.id,
      type: "STOCK_COMMITTED",
      message: `Stock deducted for ${movements} product line${movements === 1 ? "" : "s"}`,
      actorUserId: input.actorUserId,
    });
  }
  return { committed: true };
}

/** Returns committed stock to inventory (used when an invoice is voided). */
export async function restoreInvoiceStock(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; invoiceId: string; actorUserId?: string | null },
): Promise<{ restored: boolean }> {
  const invoice = await tx.invoice.findFirst({
    where: { id: input.invoiceId, workspaceId: input.workspaceId },
    select: { id: true, stockCommittedAt: true, items: { select: { productId: true, quantity: true } } },
  });
  if (!invoice?.stockCommittedAt) return { restored: false };

  let movements = 0;
  for (const item of invoice.items) {
    if (!item.productId || item.quantity <= 0) continue;
    const reason = `Invoice void stock restore [invoice:${invoice.id}:${item.productId}]`;
    const already = await tx.inventoryMovement.findFirst({
      where: { workspaceId: input.workspaceId, productId: item.productId, referenceId: invoice.id, reason },
      select: { id: true },
    });
    if (already) continue;

    const product = await tx.product.updateMany({
      where: { id: item.productId, workspaceId: input.workspaceId },
      data: { currentStock: { increment: item.quantity } },
    });
    if (product.count === 0) continue;
    const refreshed = await tx.product.findUnique({
      where: { id: item.productId },
      select: { currentStock: true, safetyStock: true },
    });
    if (refreshed) {
      await tx.product.update({
        where: { id: item.productId },
        data: { status: inventoryStatusFor(refreshed.currentStock, refreshed.safetyStock) },
      });
    }
    await tx.inventoryMovement.create({
      data: {
        workspaceId: input.workspaceId,
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        reason,
        referenceId: invoice.id,
      },
    });
    movements += 1;
  }

  await tx.invoice.update({ where: { id: invoice.id }, data: { stockCommittedAt: null } });
  if (movements > 0) {
    await addInvoiceEvent(tx, {
      workspaceId: input.workspaceId,
      invoiceId: invoice.id,
      type: "STOCK_RESTORED",
      message: `Stock restored for ${movements} product line${movements === 1 ? "" : "s"}`,
      actorUserId: input.actorUserId,
    });
  }
  return { restored: true };
}
