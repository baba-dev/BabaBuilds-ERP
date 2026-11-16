import { NextResponse } from 'next/server';
import { loadReceipt } from '@/lib/pos/receipt-load';
import { posErrorResponse, requirePos } from '../../_guard';

/** The till receipt for a counter sale, as an 80 mm PDF. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePos('view');
    if ('response' in gate) return gate.response;
    const { id } = await ctx.params;
    const r = await loadReceipt(gate.access.workspaceId, id);
    if (!r) return NextResponse.json({ code: 'NOT_FOUND', error: 'Receipt not found.' }, { status: 404 });
    return new NextResponse(Buffer.from(r.bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${r.invoice.invoiceNumber}-receipt.pdf"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return posErrorResponse(e, 'receipt');
  }
}
