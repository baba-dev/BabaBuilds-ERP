import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from '@/lib/rbac';
import type { BusinessRole } from '@/lib/permissions';

const checkoutActionSchema = z.enum(['PAY_NOW', 'INVOICE', 'PROPOSAL', 'RETAINER']);
const checkoutItemTypeSchema = z.enum(['SERVICE', 'PRODUCT', 'CUSTOM']);

const checkoutItemSchema = z.object({
  id: z.string().trim().min(1).optional(),
  type: checkoutItemTypeSchema,
  quantity: z.number().int().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  price: z.number().positive().optional(),
  taxRate: z.number().min(0).max(100).optional(),
}).strict().superRefine((item, ctx) => {
  if ((item.type === 'SERVICE' || item.type === 'PRODUCT') && !item.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['id'], message: 'Catalog item id is required.' });
  }

  if (item.type === 'CUSTOM') {
    if (!item.name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'Custom item name is required.' });
    }
    if (typeof item.price !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'Custom item price is required.' });
    }
  }
});

const checkoutRequestSchema = z.object({
  action: checkoutActionSchema,
  clientId: z.string().trim().min(1).optional().nullable(),
  items: z.array(checkoutItemSchema).min(1),
  allowNegativeStock: z.boolean().optional(),
}).strict();

type CheckoutAction = z.infer<typeof checkoutActionSchema>;
type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;

type SessionWithUserId = {
  user?: { id?: string | null } | null;
};

type ResolvedCheckoutItem = {
  id?: string;
  type: CheckoutItemInput['type'];
  name: string;
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  taxRate: number;
  lineSubtotal: Prisma.Decimal;
};

type ProductSale = {
  productId: string;
  quantity: number;
  name: string;
};

class PosCheckoutError extends Error {
  constructor(
    public readonly code: 'CLIENT_NOT_FOUND' | 'SERVICE_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INVALID_ACTION',
    public readonly meta: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

const CUSTOM_POS_LINE_ROLES = new Set<BusinessRole>(['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'SALES_MANAGER']);

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function inventoryStatusFor(currentStock: number, safetyStock: number) {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock <= safetyStock) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function buildInvoiceItems(items: ResolvedCheckoutItem[]) {
  return items.map((item) => ({
    productId: item.type === 'PRODUCT' ? item.id : null,
    description: item.description ? `${item.name} - ${item.description}` : item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
    totalAmount: item.lineSubtotal,
  }));
}

function buildProposalItems(items: ResolvedCheckoutItem[]) {
  return items.map((item) => ({
    serviceTemplateId: item.type === 'SERVICE' ? item.id : null,
    title: item.name,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.lineSubtotal,
  }));
}

function buildRetainerItems(items: ResolvedCheckoutItem[]) {
  return items.map((item) => ({
    title: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
    serviceTemplateId: item.type === 'SERVICE' ? item.id : null,
    productId: item.type === 'PRODUCT' ? item.id : null,
  }));
}

function groupProductSales(items: ResolvedCheckoutItem[]) {
  const productSales = new Map<string, ProductSale>();

  for (const item of items) {
    if (item.type !== 'PRODUCT' || !item.id) continue;

    const existing = productSales.get(item.id);
    productSales.set(item.id, {
      productId: item.id,
      quantity: (existing?.quantity ?? 0) + item.quantity,
      name: existing?.name ?? item.name,
    });
  }

  return [...productSales.values()];
}

async function commitProductSales(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  productSales: ProductSale[],
  referenceId: string,
  allowNegativeStock: boolean,
) {
  for (const sale of productSales) {
    const product = await tx.product.findFirst({
      where: { id: sale.productId, workspaceId },
      select: { id: true, name: true, currentStock: true, safetyStock: true },
    });

    if (!product) {
      throw new PosCheckoutError('PRODUCT_NOT_FOUND', { productName: sale.name });
    }

    if (!allowNegativeStock && sale.quantity > product.currentStock) {
      throw new PosCheckoutError('INSUFFICIENT_STOCK', {
        productName: product.name,
        requested: sale.quantity,
        available: product.currentStock,
      });
    }

    const updatedProduct = allowNegativeStock
      ? await tx.product.updateMany({
          where: { id: sale.productId, workspaceId },
          data: { currentStock: { decrement: sale.quantity } },
        })
      : await tx.product.updateMany({
          where: { id: sale.productId, workspaceId, currentStock: { gte: sale.quantity } },
          data: { currentStock: { decrement: sale.quantity } },
        });

    if (updatedProduct.count === 0) {
      throw new PosCheckoutError('INSUFFICIENT_STOCK', {
        productName: product.name,
        requested: sale.quantity,
        available: product.currentStock,
      });
    }

    const refreshed = await tx.product.findFirst({
      where: { id: sale.productId, workspaceId },
      select: { currentStock: true, safetyStock: true },
    });

    if (!refreshed) {
      throw new PosCheckoutError('PRODUCT_NOT_FOUND', { productName: product.name });
    }

    await tx.product.update({
      where: { id: sale.productId },
      data: { status: inventoryStatusFor(refreshed.currentStock, refreshed.safetyStock) },
    });

    await tx.inventoryMovement.create({
      data: {
        workspaceId,
        productId: sale.productId,
        type: 'OUT',
        quantity: -sale.quantity,
        reason: 'POS sale',
        referenceId,
      },
    });
  }
}

function permissionForAction(action: CheckoutAction) {
  if (action === 'PROPOSAL') return 'proposals.create' as const;
  if (action === 'RETAINER') return 'retainers.manage' as const;
  return 'invoices.create' as const;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const userId = (session as SessionWithUserId).user?.id || undefined;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json();
    const parsed = checkoutRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid checkout request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { action, items, allowNegativeStock = false } = parsed.data;
    let resolvedClientId = parsed.data.clientId || undefined;

    const actionPermission = await withPermission(userId, workspaceId, permissionForAction(action));
    if (!actionPermission.granted) return actionPermission.response;

    const hasCustomItems = items.some((item) => item.type === 'CUSTOM');
    if (hasCustomItems && !CUSTOM_POS_LINE_ROLES.has(actionPermission.role)) {
      return NextResponse.json({ error: 'Your role cannot create custom POS line items.' }, { status: 403 });
    }

    if (!resolvedClientId && (action === 'INVOICE' || action === 'PROPOSAL' || action === 'RETAINER')) {
      return NextResponse.json({ error: `Client is required for ${action} action.` }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Default Walk-in Client if none provided for immediate POS payment.
      if (!resolvedClientId) {
        let walkIn = await tx.client.findFirst({ where: { workspaceId, name: 'Walk-in Customer' } });
        if (!walkIn) {
          walkIn = await tx.client.create({
            data: { workspaceId, name: 'Walk-in Customer', email: 'walkin@example.com', address: '', country: '' }
          });
        }
        resolvedClientId = walkIn.id;
      }

      const client = await tx.client.findFirst({ where: { id: resolvedClientId, workspaceId } });
      if (!client) throw new PosCheckoutError('CLIENT_NOT_FOUND');

      const serviceIds = [...new Set(items.filter((item) => item.type === 'SERVICE').map((item) => item.id!))];
      const productIds = [...new Set(items.filter((item) => item.type === 'PRODUCT').map((item) => item.id!))];

      const serviceTemplates = serviceIds.length
        ? await tx.serviceTemplate.findMany({ where: { workspaceId, id: { in: serviceIds } } })
        : [];
      const products = productIds.length
        ? await tx.product.findMany({ where: { workspaceId, id: { in: productIds } } })
        : [];

      const serviceById = new Map(serviceTemplates.map((service) => [service.id, service]));
      const productById = new Map(products.map((product) => [product.id, product]));

      const resolvedItems: ResolvedCheckoutItem[] = [];
      for (const item of items) {
        if (item.type === 'SERVICE') {
          const service = serviceById.get(item.id!);
          if (!service) throw new PosCheckoutError('SERVICE_NOT_FOUND', { itemName: item.name || item.id! });
          const unitPrice = decimal(service.defaultPrice);
          resolvedItems.push({
            id: service.id,
            type: 'SERVICE',
            name: service.name,
            description: service.description || '',
            quantity: item.quantity,
            unitPrice,
            taxRate: item.taxRate ?? 0,
            lineSubtotal: unitPrice.mul(item.quantity),
          });
        } else if (item.type === 'PRODUCT') {
          const product = productById.get(item.id!);
          if (!product) throw new PosCheckoutError('PRODUCT_NOT_FOUND', { productName: item.name || item.id! });
          const unitPrice = decimal(product.baselinePrice);
          resolvedItems.push({
            id: product.id,
            type: 'PRODUCT',
            name: product.name,
            description: product.description || '',
            quantity: item.quantity,
            unitPrice,
            taxRate: item.taxRate ?? 0,
            lineSubtotal: unitPrice.mul(item.quantity),
          });
        } else {
          const unitPrice = decimal(item.price!);
          resolvedItems.push({
            type: 'CUSTOM',
            name: item.name!,
            description: item.description || '',
            quantity: item.quantity,
            unitPrice,
            taxRate: item.taxRate ?? 0,
            lineSubtotal: unitPrice.mul(item.quantity),
          });
        }
      }

      const subtotal = resolvedItems.reduce((acc, item) => acc.add(item.lineSubtotal), decimal(0));
      // Client-provided discounts are intentionally unsupported until a server-side discount policy exists.
      const discount = decimal(0);
      const taxableSubtotal = subtotal.sub(discount);
      const tax = resolvedItems.reduce((acc, item) => {
        return acc.add(item.lineSubtotal.mul(item.taxRate).div(100));
      }, decimal(0));
      const totalAmount = taxableSubtotal.add(tax);
      const productSales = groupProductSales(resolvedItems);

      if (action === 'PAY_NOW') {
        // Create an Invoice marked as PAID
        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            clientId: client.id,
            invoiceNumber: `POS-${Date.now().toString().slice(-6)}`,
            financialYear: new Date().getFullYear().toString(),
            invoiceDate: new Date(),
            clientName: client.name,
            serviceDescription: 'POS Checkout',
            subtotal,
            taxAmount: tax,
            grandTotal: totalAmount,
            totalAmount,
            status: 'PAID',
            amountReceived: totalAmount,
            dateReceived: new Date(),
            pdfPath: '',
            items: { create: buildInvoiceItems(resolvedItems) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, invoice.id, allowNegativeStock);
        return { message: 'Payment collected successfully!', invoice };
      } else if (action === 'INVOICE') {
        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            clientId: client.id,
            invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
            financialYear: new Date().getFullYear().toString(),
            invoiceDate: new Date(),
            clientName: client.name,
            serviceDescription: 'POS Generated Invoice',
            subtotal,
            taxAmount: tax,
            grandTotal: totalAmount,
            totalAmount,
            status: 'PENDING',
            pdfPath: '',
            items: { create: buildInvoiceItems(resolvedItems) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, invoice.id, allowNegativeStock);
        return { message: 'Invoice generated and saved.', invoice };
      } else if (action === 'PROPOSAL') {
        const proposal = await tx.proposal.create({
          data: {
            workspaceId,
            clientId: client.id,
            proposalNo: `PRP-${Date.now().toString().slice(-6)}`,
            title: 'POS Generated Proposal',
            subtotal: taxableSubtotal,
            estimatedTax: tax,
            totalAmount,
            validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
            status: 'DRAFT',
            items: { create: buildProposalItems(resolvedItems) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, proposal.id, allowNegativeStock);
        return { message: 'Proposal drafted successfully!', proposal };
      } else if (action === 'RETAINER') {
        const retainer = await tx.retainer.create({
          data: {
            workspaceId,
            clientId: client.id,
            frequency: 'MONTHLY',
            nextBillingDate: new Date(),
            status: 'ACTIVE',
            amount: totalAmount,
            items: { create: buildRetainerItems(resolvedItems) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, retainer.id, allowNegativeStock);
        return { message: 'Monthly Retainer activated!', retainer };
      }

      throw new PosCheckoutError('INVALID_ACTION');
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("POS Checkout Error:", error);
    if (error instanceof PosCheckoutError) {
      if (error.code === 'CLIENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      if (error.code === 'INVALID_ACTION') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
      if (error.code === 'SERVICE_NOT_FOUND') {
        return NextResponse.json({ error: 'Service item not found' }, { status: 400 });
      }
      if (error.code === 'PRODUCT_NOT_FOUND') {
        return NextResponse.json({ error: 'One or more products were not found for checkout.' }, { status: 400 });
      }
      if (error.code === 'INSUFFICIENT_STOCK') {
        return NextResponse.json(
          { error: `Insufficient stock for ${error.meta.productName}. Requested ${error.meta.requested}, available ${error.meta.available}.` },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ error: 'Failed to process POS checkout' }, { status: 500 });
  }
}
