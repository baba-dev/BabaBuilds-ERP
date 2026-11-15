import { NextResponse } from 'next/server';
import { counterSalePlace, snapshotGstFields } from '@/lib/gst/source';
import { validateGstin } from '@/lib/gst/gstin';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from '@/lib/rbac';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { logActivity } from '@/lib/security/activity-log';
import { isModuleEnabled } from '@/lib/modules';
import { getNextInvoiceNumber, getNextProposalNo, isUniqueConstraintError } from '@/lib/document-numbering';
import { supplierChargesGst } from "@/lib/msme/threshold";
import { changeDue, computePosTotals, PAYMENT_METHODS } from '@/lib/pos/totals';

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
  discount: z.number().min(0).optional(),
  /** How a PAY_NOW sale was paid. Cash may carry the amount handed over so change can be checked. */
  payment: z.object({
    method: z.enum(PAYMENT_METHODS),
    tendered: z.number().min(0).optional(),
    reference: z.string().trim().max(60).optional(),
  }).strict().optional(),
  /** One key per sale attempt: a repeated tap or a retried request returns the same bill instead of making a second one. */
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
  allowNegativeStock: z.boolean().optional(),
}).strict();

const MAX_NUMBERING_ATTEMPTS = 5;

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
  /** HSN (goods) or SAC (services) the line is reported under in the GST returns. */
  sacCode: string | null;
  lineSubtotal: Prisma.Decimal;
  /** What the line costs after its share of any discount; this is the figure GST is worked out on. */
  lineTaxable: Prisma.Decimal;
};

type ProductSale = {
  productId: string;
  quantity: number;
  name: string;
};

class PosCheckoutError extends Error {
  constructor(
    public readonly code: 'CLIENT_NOT_FOUND' | 'SERVICE_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INVALID_ACTION' | 'INVALID_DISCOUNT' | 'SHORT_PAYMENT',
    public readonly meta: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

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
    // Invoice items store the rate as a fraction; the POS request carries percent.
    taxRate: item.taxRate / 100,
    sacCode: item.sacCode,
    totalAmount: item.lineTaxable,
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
        balanceAfter: refreshed.currentStock,
      },
    });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    if (!(await isModuleEnabled(workspaceId, 'POS'))) {
      return NextResponse.json({ error: 'POS module is disabled' }, { status: 403 });
    }
    const userId = (session as SessionWithUserId).user?.id || undefined;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = enforceRouteRateLimit({ request, route: '/api/pos/checkout', scope: workspaceId, max: 120, windowMs: 60_000 });
    if (!limit.ok) return limit.response;

    const rawBody = await request.json();
    const parsed = checkoutRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid checkout request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { action, items, allowNegativeStock = false, discount: requestedDiscount = 0 } = parsed.data;
    let resolvedClientId = parsed.data.clientId || undefined;

    const checkoutPermission = await withPermission(userId, workspaceId, 'pos.checkout');
    if (!checkoutPermission.granted) return checkoutPermission.response;

    if (requestedDiscount > 0) {
      const discountPermission = await withPermission(userId, workspaceId, 'pos.discount');
      if (!discountPermission.granted) return discountPermission.response;
    }

    const hasCustomItems = items.some((item) => item.type === 'CUSTOM');
    if (hasCustomItems) {
      const customItemPermission = await withPermission(userId, workspaceId, 'pos.custom_item');
      if (!customItemPermission.granted) return customItemPermission.response;
    }

    if (parsed.data.idempotencyKey) {
      const prior = await prisma.invoicePayment.findFirst({ where: { workspaceId, idempotencyKey: parsed.data.idempotencyKey }, include: { invoice: true } });
      if (prior) return NextResponse.json({ success: true, message: 'Payment collected successfully!', invoice: prior.invoice, duplicate: true });
    }

    if (!resolvedClientId && (action === 'INVOICE' || action === 'PROPOSAL' || action === 'RETAINER')) {
      return NextResponse.json({ error: `Client is required for ${action} action.` }, { status: 400 });
    }

    for (let attempt = 1; attempt <= MAX_NUMBERING_ATTEMPTS; attempt += 1) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Default Walk-in Client if none provided for immediate POS payment.
          const walkInCountry = (await tx.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } }))?.countryCode || 'IN';
          // An unregistered or composition-scheme seller must not collect GST.
          const posChargesGst = supplierChargesGst(await tx.businessProfile.findUnique({ where: { workspaceId }, select: { gstRegistrationType: true } }), walkInCountry);
          if (!resolvedClientId) {
            // The counter customer: hidden from the CRM, no invented email, and not counted toward plan limits.
            let walkIn = await tx.client.findFirst({ where: { workspaceId, OR: [{ isWalkIn: true }, { name: 'Walk-in Customer' }] } });
            if (!walkIn) {
              walkIn = await tx.client.create({
                data: { workspaceId, name: 'Walk-in Customer', address: '', country: walkInCountry, countryCode: walkInCountry, isWalkIn: true, source: 'POS', isExport: false },
              });
            } else if (!walkIn.isWalkIn) {
              walkIn = await tx.client.update({ where: { id: walkIn.id }, data: { isWalkIn: true, source: 'POS' } });
            }
            resolvedClientId = walkIn.id;
          }

          const client = await tx.client.findFirst({ where: { id: resolvedClientId, workspaceId } });
          if (!client) throw new PosCheckoutError('CLIENT_NOT_FOUND');

          const serviceIds = [...new Set(items.filter((item) => item.type === 'SERVICE').map((item) => item.id!))];
          const productIds = [...new Set(items.filter((item) => item.type === 'PRODUCT').map((item) => item.id!))];

          const serviceTemplates = serviceIds.length
            ? await tx.serviceTemplate.findMany({ where: { workspaceId, id: { in: serviceIds } }, include: { sacCode: { select: { code: true, igstRate: true } } } })
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
                taxRate: item.taxRate ?? service.sacCode?.igstRate ?? 0,
                sacCode: service.sacCode?.code ?? null,
                lineSubtotal: unitPrice.mul(item.quantity),
                lineTaxable: unitPrice.mul(item.quantity),
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
                taxRate: item.taxRate ?? product.gstRate ?? 0,
                sacCode: product.hsnCode ?? null,
                lineSubtotal: unitPrice.mul(item.quantity),
                lineTaxable: unitPrice.mul(item.quantity),
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
                sacCode: null,
                lineSubtotal: unitPrice.mul(item.quantity),
                lineTaxable: unitPrice.mul(item.quantity),
              });
            }
          }

          if (!posChargesGst) for (const line of resolvedItems) line.taxRate = 0;
          const computed = computePosTotals(
            resolvedItems.map((line) => ({ unitPrice: Number(line.unitPrice), quantity: line.quantity, taxRate: line.taxRate })),
            requestedDiscount,
            true,
          );
          if (requestedDiscount > computed.subtotal) {
            throw new PosCheckoutError('INVALID_DISCOUNT');
          }
          resolvedItems.forEach((line, i) => { line.lineTaxable = decimal(computed.lines[i]!.taxable); });
          const subtotal = decimal(computed.subtotal);
          const taxableSubtotal = decimal(computed.taxable);
          const tax = decimal(computed.tax);
          const totalAmount = decimal(computed.total);
          const productSales = groupProductSales(resolvedItems);

          const profile = await tx.businessProfile.findUnique({ where: { workspaceId }, select: { invoicePrefix: true, gstin: true, gstStateCode: true } });
          const supplierGstin = validateGstin(profile?.gstin);
          const supplierState = supplierGstin.valid ? supplierGstin.stateCode : profile?.gstStateCode ?? null;
          const gstFields = snapshotGstFields(client, { placeOfSupply: counterSalePlace(client, supplierState) });
          const invoicePrefix = profile?.invoicePrefix || 'INV';
          const posWorkspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } });
          const posCurrency = posWorkspace?.baseCurrency || 'INR';

          if (action === 'PAY_NOW') {
            // Create an Invoice marked as PAID
            const invoiceDate = new Date();
            const { invoiceNumber, financialYear } = await getNextInvoiceNumber(tx, workspaceId, invoiceDate, invoicePrefix);
            const invoice = await tx.invoice.create({
              data: {
                workspaceId,
                clientId: client.id,
                invoiceNumber,
                financialYear,
                invoiceDate,
                clientName: client.name,
                serviceDescription: 'POS Checkout',
                source: 'POS',
                ...gstFields,
                currency: posCurrency,
                baseGrandTotal: totalAmount,
                stockCommittedAt: new Date(),
                subtotal: taxableSubtotal,
                taxAmount: tax,
                grandTotal: totalAmount,
                totalAmount,
                status: 'PAID',
                amountReceived: totalAmount,
                dateReceived: new Date(),
                pdfPath: '',
                items: { create: buildInvoiceItems(resolvedItems) },
              },
            });
            const payment = parsed.data.payment;
            if (payment?.method === 'CASH' && payment.tendered !== undefined && changeDue(computed.total, payment.tendered) === null) {
              throw new PosCheckoutError('SHORT_PAYMENT', { total: computed.total, tendered: payment.tendered });
            }
            await tx.invoicePayment.create({
              data: {
                workspaceId, invoiceId: invoice.id, amount: totalAmount, receivedAt: invoice.invoiceDate, method: payment?.method ?? 'OTHER',
                reference: payment?.reference || null, notes: 'POS checkout', idempotencyKey: parsed.data.idempotencyKey ?? null, createdByUserId: userId,
              },
            });
            await commitProductSales(tx, workspaceId, productSales, invoice.id, allowNegativeStock);
            return { message: 'Payment collected successfully!', invoice, change: payment?.method === 'CASH' && payment.tendered !== undefined ? changeDue(computed.total, payment.tendered) : null, totals: computed };
          } else if (action === 'INVOICE') {
            const invoiceDate = new Date();
            const { invoiceNumber, financialYear } = await getNextInvoiceNumber(tx, workspaceId, invoiceDate, invoicePrefix);
            const invoice = await tx.invoice.create({
              data: {
                workspaceId,
                clientId: client.id,
                invoiceNumber,
                financialYear,
                invoiceDate,
                clientName: client.name,
                serviceDescription: 'POS Generated Invoice',
                source: 'POS',
                ...gstFields,
                currency: posCurrency,
                baseGrandTotal: totalAmount,
                stockCommittedAt: new Date(),
                subtotal: taxableSubtotal,
                taxAmount: tax,
                grandTotal: totalAmount,
                totalAmount,
                status: 'PENDING',
                pdfPath: '',
                items: { create: buildInvoiceItems(resolvedItems) },
              },
            });
            await commitProductSales(tx, workspaceId, productSales, invoice.id, allowNegativeStock);
            return { message: 'Invoice generated and saved.', invoice };
          } else if (action === 'PROPOSAL') {
            const proposalNo = await getNextProposalNo(tx, workspaceId);
            const proposal = await tx.proposal.create({
              data: {
                workspaceId,
                clientId: client.id,
                proposalNo,
                title: 'POS Generated Proposal',
                subtotal: taxableSubtotal,
                estimatedTax: tax,
                totalAmount,
                validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
                status: 'DRAFT',
                items: { create: buildProposalItems(resolvedItems) },
              },
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
                items: { create: buildRetainerItems(resolvedItems) },
              },
            });
            await commitProductSales(tx, workspaceId, productSales, retainer.id, allowNegativeStock);
            return { message: 'Monthly Retainer activated!', retainer };
          }

          throw new PosCheckoutError('INVALID_ACTION');
        });

        void logActivity({
          workspaceId,
          action: 'pos.checkout',
          status: 'SUCCESS',
          actor: { userId, email: (session.user as { email?: string | null } | undefined)?.email ?? null },
          entity: { type: 'pos_checkout', id: workspaceId },
          metadata: { action, lines: items.length, units: items.reduce((s, i) => s + (i.quantity ?? 0), 0) },
        });
        return NextResponse.json({ success: true, ...result });
      } catch (error) {
        if (attempt < MAX_NUMBERING_ATTEMPTS && isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    return NextResponse.json({ error: 'Could not generate a unique document number.' }, { status: 409 });
  } catch (error) {
    console.error("POS Checkout Error:", error);
    if (error instanceof PosCheckoutError) {
      if (error.code === 'CLIENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      if (error.code === 'INVALID_ACTION') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
      if (error.code === 'INVALID_DISCOUNT') {
        return NextResponse.json({ error: 'Discount cannot exceed subtotal' }, { status: 400 });
      }
      if (error.code === 'SHORT_PAYMENT') {
        return NextResponse.json({ error: 'The cash received does not cover the total.', code: 'SHORT_PAYMENT' }, { status: 422 });
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
