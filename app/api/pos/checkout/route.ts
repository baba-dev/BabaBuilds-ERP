import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

type PosCartItem = {
  id?: string;
  type?: string;
  name?: string;
  description?: string;
  price?: number;
  quantity?: number;
  taxRate?: number;
};

type ProductCartLine = PosCartItem & { id: string; quantity: number };

type ProductSale = {
  productId: string;
  quantity: number;
  name: string;
};

const inventoryStatusFor = (currentStock: number, safetyStock: number) => {
  if (currentStock <= 0) return "OUT_OF_STOCK";
  if (currentStock <= safetyStock) return "LOW_STOCK";
  return "IN_STOCK";
};

const isCatalogProductLine = (item: PosCartItem): item is ProductCartLine => {
  return item.type === "PRODUCT" && typeof item.id === "string" && !item.id.startsWith("custom-") && Number(item.quantity) > 0;
};

const groupProductSales = (items: PosCartItem[]) => {
  const productSales = new Map<string, ProductSale>();

  for (const item of items) {
    if (!isCatalogProductLine(item)) continue;

    const quantity = Number(item.quantity);
    const existing = productSales.get(item.id);
    productSales.set(item.id, {
      productId: item.id,
      quantity: (existing?.quantity ?? 0) + quantity,
      name: existing?.name ?? item.name ?? "Product",
    });
  }

  return productSales;
};

const commitProductSales = async (
  tx: Prisma.TransactionClient,
  workspaceId: string,
  productSales: ProductSale[],
  referenceId: string,
  allowNegativeStock: boolean,
) => {
  for (const sale of productSales) {
    const product = await tx.product.findFirst({
      where: { id: sale.productId, workspaceId },
      select: { id: true, name: true, currentStock: true, safetyStock: true },
    });

    if (!product) {
      throw new Error(`POS_PRODUCT_NOT_FOUND:${sale.productId}`);
    }

    if (!allowNegativeStock && sale.quantity > product.currentStock) {
      throw new Error(`POS_INSUFFICIENT_STOCK:${product.name}:${sale.quantity}:${product.currentStock}`);
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
      throw new Error(`POS_INSUFFICIENT_STOCK:${product.name}:${sale.quantity}:${product.currentStock}`);
    }

    const refreshed = await tx.product.findFirst({
      where: { id: sale.productId, workspaceId },
      select: { currentStock: true, safetyStock: true },
    });

    if (!refreshed) {
      throw new Error(`POS_PRODUCT_NOT_FOUND:${sale.productId}`);
    }

    await tx.product.update({
      where: { id: sale.productId },
      data: { status: inventoryStatusFor(refreshed.currentStock, refreshed.safetyStock) },
    });

    await tx.inventoryMovement.create({
      data: {
        workspaceId,
        productId: sale.productId,
        type: "OUT",
        quantity: -sale.quantity,
        reason: "POS sale",
        referenceId,
      },
    });
  }
};

const invoiceItemsFromCart = (items: PosCartItem[]) => items.map((i) => ({
  description: i.description || i.name || '',
  quantity: Number(i.quantity) || 1,
  unitPrice: Number(i.price) || 0,
  totalAmount: (Number(i.price) || 0) * (Number(i.quantity) || 1),
}));

const proposalItemsFromCart = (items: PosCartItem[]) => items.map((i) => ({
  title: i.name || 'POS item',
  description: i.description || '',
  quantity: Number(i.quantity) || 1,
  unitPrice: Number(i.price) || 0,
  total: (Number(i.price) || 0) * (Number(i.quantity) || 1),
}));

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const body = await request.json();
    const { action, clientId, items, discount = 0 } = body;
    // action: 'PAY_NOW', 'INVOICE', 'PROPOSAL', 'RETAINER'

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const productSalesById = groupProductSales(items);
    const productIds = [...productSalesById.keys()];
    const allowNegativeStock = body.allowNegativeStock === true;

    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { workspaceId, id: { in: productIds } },
        select: { id: true, name: true, currentStock: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));

      for (const sale of productSalesById.values()) {
        const product = productsById.get(sale.productId);
        if (!product) {
          return NextResponse.json({ error: `Product not found for checkout: ${sale.name}.` }, { status: 400 });
        }
        if (!allowNegativeStock && sale.quantity > product.currentStock) {
          return NextResponse.json(
            { error: `Insufficient stock for ${product.name}. Requested ${sale.quantity}, available ${product.currentStock}.` },
            { status: 400 },
          );
        }
      }
    }

    let resolvedClientId = clientId;
    if (!resolvedClientId && (action === 'INVOICE' || action === 'PROPOSAL' || action === 'RETAINER')) {
      return NextResponse.json({ error: `Client is required for ${action} action.` }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Default Walk-in Client if none provided
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
      if (!client) throw new Error('POS_CLIENT_NOT_FOUND');

      const totalAmount = items.reduce((acc: number, item: PosCartItem) => acc + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0) - discount;
      const productSales = [...productSalesById.values()];

      if (action === 'PAY_NOW') {
        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            clientId: resolvedClientId,
            invoiceNumber: `POS-${Date.now().toString().slice(-6)}`,
            financialYear: new Date().getFullYear().toString(),
            invoiceDate: new Date(),
            clientName: client.name,
            serviceDescription: 'POS Checkout',
            totalAmount,
            status: 'PAID',
            amountReceived: totalAmount,
            dateReceived: new Date(),
            pdfPath: '',
            items: { create: invoiceItemsFromCart(items) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, invoice.id, allowNegativeStock);
        return { message: 'Payment collected successfully!', invoice };
      } else if (action === 'INVOICE') {
        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            clientId: resolvedClientId,
            invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
            financialYear: new Date().getFullYear().toString(),
            invoiceDate: new Date(),
            clientName: client.name,
            serviceDescription: 'POS Generated Invoice',
            totalAmount,
            status: 'PENDING',
            pdfPath: '',
            items: { create: invoiceItemsFromCart(items) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, invoice.id, allowNegativeStock);
        return { message: 'Invoice generated and saved.', invoice };
      } else if (action === 'PROPOSAL') {
        const proposal = await tx.proposal.create({
          data: {
            workspaceId,
            clientId: resolvedClientId,
            proposalNo: `PRP-${Date.now().toString().slice(-6)}`,
            title: 'POS Generated Proposal',
            subtotal: totalAmount,
            estimatedTax: 0,
            totalAmount,
            validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            status: 'DRAFT',
            items: { create: proposalItemsFromCart(items) }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, proposal.id, allowNegativeStock);
        return { message: 'Proposal drafted successfully!', proposal };
      } else if (action === 'RETAINER') {
        const retainer = await tx.retainer.create({
          data: {
            workspaceId,
            clientId: resolvedClientId,
            frequency: 'MONTHLY',
            nextBillingDate: new Date(),
            status: 'ACTIVE',
            items: {
              create: items.map((i: PosCartItem) => ({
                title: i.name || 'POS item',
                quantity: Number(i.quantity) || 1,
                unitPrice: Number(i.price) || 0,
                taxRate: i.taxRate || 0,
                serviceTemplateId: i.type === 'SERVICE' && i.id && !i.id.startsWith('custom-') ? i.id : null,
                productId: i.type === 'PRODUCT' && i.id && !i.id.startsWith('custom-') ? i.id : null,
              }))
            }
          }
        });
        await commitProductSales(tx, workspaceId, productSales, retainer.id, allowNegativeStock);
        return { message: 'Monthly Retainer activated!', retainer };
      }

      throw new Error('POS_INVALID_ACTION');
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("POS Checkout Error:", error);
    if (error instanceof Error) {
      if (error.message === 'POS_CLIENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      if (error.message === 'POS_INVALID_ACTION') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
      if (error.message.startsWith('POS_PRODUCT_NOT_FOUND:')) {
        return NextResponse.json({ error: 'One or more products were not found for checkout.' }, { status: 400 });
      }
      if (error.message.startsWith('POS_INSUFFICIENT_STOCK:')) {
        const [, productName, requested, available] = error.message.split(':');
        return NextResponse.json(
          { error: `Insufficient stock for ${productName}. Requested ${requested}, available ${available}.` },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ error: 'Failed to process POS checkout' }, { status: 500 });
  }
}
