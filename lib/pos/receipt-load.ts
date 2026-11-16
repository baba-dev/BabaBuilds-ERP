import 'server-only';
import { prisma } from '@/lib/prisma';
import { buildReceiptPdf } from './receipt-pdf';

/** Loads a counter sale and renders its till receipt. Returns null when the sale is not in this workspace. */
export async function loadReceipt(workspaceId: string, invoiceId: string) {
  const [invoice, profile] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId, source: 'POS' },
      include: { items: { select: { description: true, quantity: true, unitPrice: true, totalAmount: true } }, payments: { where: { reversedAt: null }, orderBy: { createdAt: 'asc' }, take: 1, select: { method: true, reference: true } }, client: { select: { id: true, name: true, isWalkIn: true } } },
    }),
    prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true, address: true, gstin: true, phone: true } }),
  ]);
  if (!invoice) return null;
  const pay = invoice.payments[0];
  const bytes = await buildReceiptPdf({
    company: { name: profile?.companyName ?? 'Receipt', address: profile?.address, gstin: profile?.gstin, phone: profile?.phone },
    receipt: { number: invoice.invoiceNumber, date: invoice.invoiceDate, customer: invoice.client && !invoice.client.isWalkIn ? invoice.client.name : null, method: pay?.method ?? null, reference: pay?.reference ?? null },
    lines: invoice.items.map((i) => ({ name: i.description, quantity: i.quantity, unitPrice: Number(i.unitPrice), total: Number(i.totalAmount) })),
    totals: { subtotal: Number(invoice.subtotal), tax: Number(invoice.taxAmount), total: Number(invoice.totalAmount) },
    currency: invoice.currency || 'INR',
    locale: 'en-IN',
  });
  return { bytes, invoice, companyName: profile?.companyName ?? 'Receipt' };
}
