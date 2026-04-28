import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
      code:
        | "ORDER_NOT_FOUND"
        | "ORDER_NOT_PAYABLE"
        | "VERIFY_BINDING_FAILED"
        | "STOCK_COMMIT_FAILED"
        | "INVOICE_LIMIT_BLOCKED";
      message: string;
      linkedInvoiceId?: string | null;
      reason?: string;
    };

const inventoryStatusFor = (stock: number, safetyStock: number) =>
  stock <= 0 ? "OUT_OF_STOCK" : stock <= safetyStock ? "LOW_STOCK" : "IN_STOCK";

const buildMovementReason = (orderId: string, productId: string) =>
  `Shop order stock commit [shop-order:${orderId}:${productId}]`;

export async function commitShopOrderPayment(
  input: CommitShopOrderPaymentInput,
): Promise<CommitShopOrderPaymentResult> {
  const order = await prisma.shopOrder.findFirst({
    where: { id: input.shopOrderId, workspaceId: input.workspaceId },
    include: {
      items: true,
      workspace: {
        include: { businessProfile: { select: { shopSlug: true } } },
      },
      linkedInvoice: { select: { id: true } },
    },
  });

  if (!order) {
    return { ok: false, code: "ORDER_NOT_FOUND", message: "Order not found." };
  }

  if (input.expectedSlug) {
    const storedSlug = order.workspace.businessProfile?.shopSlug?.toLowerCase() ?? null;
    if (!storedSlug || storedSlug !== input.expectedSlug.toLowerCase()) {
      return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Order does not belong to this shop." };
    }
  }

  if (input.gatewayBinding) {
    const expectedCurrency = String(order.currency || "INR").toUpperCase();
    const submittedCurrency = String(input.gatewayBinding.currency || "").toUpperCase();
    const expectedAmountSubunits = Math.round(Number(order.amount) * 100);

    if (order.gateway !== input.gatewayBinding.gateway) {
      return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Gateway mismatch." };
    }
    if (
      input.gatewayBinding.orderId &&
      order.razorpayOrderId &&
      input.gatewayBinding.orderId !== order.razorpayOrderId
    ) {
      return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Gateway order ID mismatch." };
    }
    if (
      typeof input.gatewayBinding.amountSubunits === "number" &&
      Number.isFinite(input.gatewayBinding.amountSubunits) &&
      input.gatewayBinding.amountSubunits !== expectedAmountSubunits
    ) {
      return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Payment amount mismatch." };
    }
    if (submittedCurrency && submittedCurrency !== expectedCurrency) {
      return { ok: false, code: "VERIFY_BINDING_FAILED", message: "Payment currency mismatch." };
    }
  }

  if (order.status === "PAID" || order.status === "FULFILLED") {
    return {
      ok: true,
      orderId: order.id,
      alreadyPaid: true,
      linkedInvoiceId: order.linkedInvoice?.id ?? order.linkedInvoiceId ?? null,
    };
  }
  if (order.status !== "PENDING") {
    return {
      ok: false,
      code: "ORDER_NOT_PAYABLE",
      message: `Order is not payable in status ${order.status}.`,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            workspaceId: order.workspaceId,
            currentStock: { gte: item.quantity },
          },
          data: { currentStock: { decrement: item.quantity } },
        });

        if (updated.count === 0) {
          await tx.shopOrder.update({
            where: { id: order.id },
            data: { status: "FAILED", buyerNote: `Stock commit failed for product ${item.productName}.` },
          });
          return {
            ok: false as const,
            code: "STOCK_COMMIT_FAILED" as const,
            message: `Insufficient stock for ${item.productName}.`,
            reason: "INSUFFICIENT_CONCURRENT_STOCK",
          };
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

        const reason = buildMovementReason(order.id, item.productId);
        const movementExists = await tx.inventoryMovement.findFirst({
          where: {
            workspaceId: order.workspaceId,
            productId: item.productId,
            referenceId: order.id,
            reason,
          },
          select: { id: true },
        });

        if (!movementExists) {
          await tx.inventoryMovement.create({
            data: {
              workspaceId: order.workspaceId,
              productId: item.productId,
              type: "OUT",
              quantity: -item.quantity,
              reason,
              referenceId: order.id,
            },
          });
        }
      }

      const paidOrder = await tx.shopOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          ...(input.gatewayBinding?.gateway === "RAZORPAY"
            ? {
                razorpayPaymentId: input.gatewayBinding.paymentId ?? order.razorpayPaymentId,
                razorpaySignature: input.gatewayBinding.signature ?? order.razorpaySignature,
              }
            : {}),
        },
        select: { id: true, linkedInvoiceId: true },
      });

      return {
        ok: true as const,
        orderId: paidOrder.id,
        linkedInvoiceId: paidOrder.linkedInvoiceId,
      };
    });

    if (!result.ok) return result;
    return {
      ok: true,
      orderId: result.orderId,
      alreadyPaid: false,
      linkedInvoiceId: result.linkedInvoiceId ?? null,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        ok: false,
        code: "STOCK_COMMIT_FAILED",
        message: "Failed to commit stock.",
        reason: error.code,
      };
    }
    throw error;
  }
}
