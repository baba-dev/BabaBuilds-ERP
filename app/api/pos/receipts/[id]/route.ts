import { NextResponse } from 'next/server';
import { buildReceiptPdf } from '@/lib/pos/receipt-pdf';
import { prisma } from '@/lib/prisma';
import { posErrorResponse, requirePos } from '../../_guard';

/** The till receipt for a counter sale, as an 80 mm PDF. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePos('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const { id } = await ctx.params;
    const [invoice, profile] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id, workspaceId, source: 'POS' },
        include: { items: { select: { description: true, quantity: true, unitPrice: true, totalAmount: true } }, payments: { where: { reversedAt: null }, orderBy: { createdAt: 'asc' }, take: 1, select: { method: true, reference: true } }, client: { select: { name: true, isWalkIn: true } } },
      }),
      prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true, address: true, gstin: true, phone: true } }),
    ]);
    if (!invoice) return NextResponse.json({ code: 'NOT_FOUND', error: 'Receipt not found.' }, { status: 404 });
    const pay = invoice.payments[0];
    const bytes = await buildReceiptPdf({
      company: { name: profile?.companyName ?? 'Receipt', address: profile?.address, gstin: profile?.gstin, phone: profile?.phone },
      receipt: { number: invoice.invoiceNumber, date: invoice.invoiceDate, customer: invoice.client && !invoice.client.isWalkIn ? invoice.client.name : null, method: pay?.method ?? null, reference: pay?.reference ?? null },
      lines: invoice.items.map((i) => ({ name: i.description, quantity: i.quantity, unitPrice: Number(i.unitPrice), total: Number(i.totalAmount) })),
      totals: { subtotal: Number(invoice.subtotal), tax: Number(invoice.taxAmount), total: Number(invoice.totalAmount) },
      currency: invoice.currency || 'INR',
      locale: 'en-IN',
    });
    return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${invoice.invoiceNumber}-receipt.pdf"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return posErrorResponse(e, 'receipt');
  }
}
