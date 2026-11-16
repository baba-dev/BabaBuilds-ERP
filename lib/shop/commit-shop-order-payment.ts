import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextInvoiceNumber, isUniqueConstraintError } from "@/lib/document-numbering";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";
import { snapshotGstFields } from "@/lib/gst/source";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { emailBuyer } from "./buyer-email";
import { PAID_STATUSES } from "./status";
import { toMinorUnits } from "./pricing";

type CommitSource = "VERIFY" | "ADMIN" | "STRIPE";

export type CommitShopOrderPaymentInput = {
  shopOrderId: string;
  workspaceId: string;
  source: CommitSource;
  expectedSlug?: string;
  gatewayBinding?: {
    gateway: "RAZORPAY" | "STRIPE";
    orderId?: string | null;
    paymentId?: string | null;
    signature?: string | null;
    amountSubunits?: number | null;
    currency?: string | null;
  };
};

export type CommitShopOrderPaymentResult =
  | { ok: true; orderId: string; alreadyPaid: boolean; linkedInvoiceId: string | null }
  | {
      ok: false;
      code: "ORDER_NOT_FOUND" | "ORDER_NOT_PAYABLE" | "VERIFY_BINDING_FAILED" | "STOCK_COMMIT_FAILED" | "INVOICE_LIMIT_BLOCKED";
      message: string;
      linkedInvoiceId?: string | null;
      reason?: string;
      /** Money was received but the goods could not be reserved: the order is now waiting for a refund. */
      refundDue?: boolean;
    };

const inventoryStatusFor = (stock: number, safetyStock: number) => (stock <= 0 ? "OUT_OF_STOCK" : stock <= safetyStock ? "LOW_STOCK" : "IN_STOCK");
const buildMovementReason = (orderId: string, productId: string) => `Shop order stock commit [shop-order:${orderId}:${productId}]`;

class ShortStock extends Error {
  constructor(readonly productName: string) { super(`SHORT_STOCK:${productName}`); }
}

/**
 * Settles a paid shop order in one transaction: stock leaves, the order becomes PAID, the buyer is added to the CRM and
 * an invoice with its payment is raised (so the sale shows in Income, GST returns and reports). If any line is no longer
 * in stock nothing is kept; for a payment the buyer has already made the order is parked as REFUND_DUE for the owner.
 */
export async function commitShopOrderPayment(input: CommitShopOrderPaymentInput): Promise<CommitShopOrderPaymentResult> {
  const order = await prisma.shopOrder.findFirst({
    where: { id: input.shopOrderId, workspaceId: input.workspaceId },
    include: { items: true, workspace: { include: { businessProfile: { select: { shopSlug: true, invoicePrefix: true, gstin: true, gstStateCode: true } } } }, linkedInvoice: { select: { id: true } } },
  });
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND", message: "Order not found." };

  if (input.expectedSlug) {
    const storedSlug = order.workspace.businessProfile?.shopSlug?.toLowerCase() ?? null;
    if (!storedSlug || storedSlug !== input.expectedSlug.toLowerCase()) return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Order does not belong to this shop." };
  }

  if (input.gatewayBinding) {
    const expectedCurrency = String(order.currency || "INR").toUpperCase();
    const submittedCurrency = String(input.gatewayBinding.currency || "").toUpperCase();
    const expectedMinor = toMinorUnits(Number(order.amount), expectedCurrency);
    if (order.gateway !== input.gatewayBinding.gateway) return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Gateway mismatch." };
    if (input.gatewayBinding.orderId && order.razorpayOrderId && input.gatewayBinding.orderId !== order.razorpayOrderId) return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Gateway order ID mismatch." };
    if (typeof input.gatewayBinding.amountSubunits === "number" && Number.isFinite(input.gatewayBinding.amountSubunits) && input.gatewayBinding.amountSubunits !== expectedMinor) return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Payment amount mismatch." };
    if (submittedCurrency && submittedCurrency !== expectedCurrency) return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Payment currency mismatch." };
  }

  if ((PAID_STATUSES as string[]).includes(order.status)) {
    return { ok: true, orderId: order.id, alreadyPaid: true, linkedInvoiceId: order.linkedInvoice?.id ?? order.linkedInvoiceId ?? null };
  }
  const payable = order.status === "PENDING" || (order.status === "FAILED" && input.source === "ADMIN");
  if (!payable) return { ok: false, code: "ORDER_NOT_PAYABLE", message: `Order is not payable in status ${order.status}.` };

  const profile = order.workspace.businessProfile;
  const paymentRef = input.gatewayBinding?.paymentId ?? order.razorpayPaymentId ?? order.stripePaymentIntentId ?? null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const products = await tx.product.findMany({ where: { workspaceId: order.workspaceId, id: { in: order.items.map((i) => i.productId) } }, select: { id: true, hsnCode: true } });
        const hsn = new Map(products.map((p) => [p.id, p.hsnCode]));

        for (const item of order.items) {
          const moved = await tx.product.updateMany({ where: { id: item.productId, workspaceId: order.workspaceId, currentStock: { gte: item.quantity } }, data: { currentStock: { decrement: item.quantity } } });
          if (moved.count === 0) throw new ShortStock(item.productName);
          const after = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { currentStock: true, safetyStock: true } });
          await tx.product.update({ where: { id: item.productId }, data: { status: inventoryStatusFor(after.currentStock, after.safetyStock) } });
          const reason = buildMovementReason(order.id, item.productId);
          const exists = await tx.inventoryMovement.findFirst({ where: { workspaceId: order.workspaceId, productId: item.productId, referenceId: order.id, reason }, select: { id: true } });
          if (!exists) await tx.inventoryMovement.create({ data: { workspaceId: order.workspaceId, productId: item.productId, type: "OUT", quantity: -item.quantity, reason, referenceId: order.id, balanceAfter: after.currentStock } });
        }

        // The buyer becomes a customer in the CRM (matched by email), so the sale sits on their record.
        const country = order.workspace.countryCode || "IN";
        let client = await tx.client.findFirst({ where: { workspaceId: order.workspaceId, email: order.buyerEmail, archivedAt: null, isWalkIn: false } });
        if (!client) {
          client = await tx.client.create({
            data: { workspaceId: order.workspaceId, name: order.buyerName, email: order.buyerEmail, phone: order.buyerPhone, address: order.shippingAddress ?? "", country, countryCode: country, gstStateCode: order.buyerStateCode, taxId: order.buyerGstin, source: "SHOP", isExport: false },
          });
        }

        const invoiceDate = new Date();
        const { invoiceNumber, financialYear } = await getNextInvoiceNumber(tx, order.workspaceId, invoiceDate, profile?.invoicePrefix || "INV");
        const total = new Prisma.Decimal(order.amount);
        const tax = new Prisma.Decimal(order.taxTotal);
        const invoice = await tx.invoice.create({
          data: {
            workspaceId: order.workspaceId, clientId: client.id, invoiceNumber, financialYear, invoiceDate, clientName: client.name,
            serviceDescription: "Online shop order", source: "SHOP",
            ...snapshotGstFields(client, { placeOfSupply: order.buyerStateCode }),
            currency: order.currency, baseGrandTotal: total, stockCommittedAt: new Date(),
            subtotal: total.sub(tax), taxAmount: tax, grandTotal: total, totalAmount: total, status: "PAID", amountReceived: total, dateReceived: invoiceDate, pdfPath: "",
            items: { create: order.items.map((i) => ({ productId: i.productId, description: `${i.productName} (${i.sku})`, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate / 100, sacCode: hsn.get(i.productId) ?? null, totalAmount: i.lineTotal })) },
          },
        });
        await tx.invoicePayment.create({
          data: { workspaceId: order.workspaceId, invoiceId: invoice.id, amount: total, receivedAt: invoiceDate, method: "OTHER", reference: paymentRef, notes: `Online shop order (${order.gateway ?? "gateway"})`, idempotencyKey: `shop-order-${order.id}` },
        });

        const paid = await tx.shopOrder.update({
          where: { id: order.id },
          data: {
            status: "PAID", paidAt: new Date(), linkedInvoiceId: invoice.id,
            ...(input.gatewayBinding?.gateway === "RAZORPAY" ? { razorpayPaymentId: input.gatewayBinding.paymentId ?? order.razorpayPaymentId, razorpaySignature: input.gatewayBinding.signature ?? order.razorpaySignature } : {}),
            ...(input.gatewayBinding?.gateway === "STRIPE" && input.gatewayBinding.paymentId ? { stripePaymentIntentId: input.gatewayBinding.paymentId } : {}),
          },
          select: { id: true, linkedInvoiceId: true },
        });
        return { orderId: paid.id, linkedInvoiceId: paid.linkedInvoiceId };
      }, { timeout: 30_000 });

      try { invalidateDashboardCacheForWorkspace(order.workspaceId); } catch { /* a stale cache is harmless */ }
      void emailBuyer(order.id, "PAID");
      return { ok: true, orderId: result.orderId, alreadyPaid: false, linkedInvoiceId: result.linkedInvoiceId ?? null };
    } catch (error) {
      if (error instanceof ShortStock) {
        const moneyIn = input.source !== "ADMIN";
        if (moneyIn) {
          await prisma.shopOrder.update({
            where: { id: order.id },
            data: { status: "REFUND_DUE", paidAt: new Date(), internalNote: `Paid, but ${error.productName} sold out before the order could be confirmed. Refund the customer.`, ...(input.gatewayBinding?.gateway === "RAZORPAY" ? { razorpayPaymentId: input.gatewayBinding.paymentId ?? order.razorpayPaymentId } : {}), ...(input.gatewayBinding?.gateway === "STRIPE" && input.gatewayBinding.paymentId ? { stripePaymentIntentId: input.gatewayBinding.paymentId } : {}) },
          });
          void dispatchNotification({ event: "SHOP_ORDER_STATUS_CHANGED", workspaceId: order.workspaceId, data: { orderId: order.id, buyerName: order.buyerName, buyerEmail: order.buyerEmail, oldStatus: order.status, newStatus: "REFUND_DUE", amount: `${order.currency} ${order.amount.toString()}` } }).catch(() => null);
          void emailBuyer(order.id, "REFUND_DUE");
        }
        return { ok: false, code: "STOCK_COMMIT_FAILED", message: `Insufficient stock for ${error.productName}.`, reason: "INSUFFICIENT_CONCURRENT_STOCK", refundDue: moneyIn };
      }
      if (isUniqueConstraintError(error) && attempt < 5) continue; // invoice number taken by a concurrent sale
      if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, code: "STOCK_COMMIT_FAILED", message: "Failed to commit the order.", reason: error.code };
      throw error;
    }
  }
  return { ok: false, code: "STOCK_COMMIT_FAILED", message: "Could not allocate an invoice number. Please retry.", reason: "NUMBERING" };
}
