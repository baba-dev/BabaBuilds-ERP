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

const CUSTOM_POS_LINE_ROLES = new Set<BusinessRole>(['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'SALES_MANAGER']);

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function buildInvoiceItems(items: ResolvedCheckoutItem[]) {
  return items.map((item) => ({
    productId: item.type === 'PRODUCT' ? item.id : null,
    description: item.description ? `${item.name}\n${item.description}` : item.name,
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

    const { action, items } = parsed.data;
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

    // Default Walk-in Client if none provided for immediate POS payment.
    if (!resolvedClientId) {
      let walkIn = await prisma.client.findFirst({ where: { workspaceId, name: 'Walk-in Customer' } });
      if (!walkIn) {
        walkIn = await prisma.client.create({
          data: { workspaceId, name: 'Walk-in Customer', email: 'walkin@example.com', address: '', country: '' }
        });
      }
      resolvedClientId = walkIn.id;
    }

    const client = await prisma.client.findFirst({ where: { id: resolvedClientId, workspaceId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    const serviceIds = [...new Set(items.filter((item) => item.type === 'SERVICE').map((item) => item.id!))];
    const productIds = [...new Set(items.filter((item) => item.type === 'PRODUCT').map((item) => item.id!))];

    const [serviceTemplates, products] = await Promise.all([
      serviceIds.length
        ? prisma.serviceTemplate.findMany({ where: { workspaceId, id: { in: serviceIds } } })
        : Promise.resolve([]),
      productIds.length
        ? prisma.product.findMany({ where: { workspaceId, id: { in: productIds } } })
        : Promise.resolve([]),
    ]);

    const serviceById = new Map(serviceTemplates.map((service) => [service.id, service]));
    const productById = new Map(products.map((product) => [product.id, product]));

    const resolvedItems: ResolvedCheckoutItem[] = [];
    for (const item of items) {
      if (item.type === 'SERVICE') {
        const service = serviceById.get(item.id!);
        if (!service) return NextResponse.json({ error: 'Service item not found' }, { status: 400 });
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
        if (!product) return NextResponse.json({ error: 'Product item not found' }, { status: 400 });
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

    if (action === 'PAY_NOW') {
      // Create an Invoice marked as PAID
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
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
      return NextResponse.json({ success: true, message: 'Payment collected successfully!', invoice });
    } else if (action === 'INVOICE') {
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
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
      return NextResponse.json({ success: true, message: 'Invoice generated and saved.', invoice });
    } else if (action === 'PROPOSAL') {
      const proposal = await prisma.proposal.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
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
      return NextResponse.json({ success: true, message: 'Proposal drafted successfully!', proposal });
    } else if (action === 'RETAINER') {
      const retainer = await prisma.retainer.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
          frequency: 'MONTHLY',
          nextBillingDate: new Date(),
          status: 'ACTIVE',
          amount: totalAmount,
          items: { create: buildRetainerItems(resolvedItems) }
        }
      });
      return NextResponse.json({ success: true, message: 'Monthly Retainer activated!', retainer });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error("POS Checkout Error:", error);
    return NextResponse.json({ error: 'Failed to process POS checkout' }, { status: 500 });
  }
}
