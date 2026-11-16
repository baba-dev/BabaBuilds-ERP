import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { posErrorResponse, requirePos } from '../../_guard';

/** Takes a held sale off the list: used when it is resumed or discarded. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePos('checkout');
    if ('response' in gate) return gate.response;
    const { id } = await ctx.params;
    const gone = await prisma.posHeldSale.deleteMany({ where: { id, workspaceId: gate.access.workspaceId } });
    if (gone.count === 0) return NextResponse.json({ code: 'NOT_FOUND', error: 'That held sale is no longer there.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return posErrorResponse(e, 'holds.delete');
  }
}
