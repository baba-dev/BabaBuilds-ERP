import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cashVariance, summarizeShift, varianceNeedsNote } from '@/lib/pos/closeout';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { posErrorResponse, readJson, requirePos } from '../_guard';

/** The shift so far: from the last close (or the start of today) to now. Always worked out on the server. */
async function currentShift(workspaceId: string, now = new Date()) {
  const last = await prisma.posCloseout.findFirst({ where: { workspaceId }, orderBy: { closedAt: 'desc' }, select: { closedAt: true } });
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = last?.closedAt ?? startOfDay;
  const payments = await prisma.invoicePayment.findMany({
    where: { workspaceId, reversedAt: null, createdAt: { gt: periodStart, lte: now }, invoice: { source: 'POS', status: { not: 'VOID' } } },
    select: { method: true, amount: true },
    take: 20_000,
  });
  const summary = summarizeShift(payments.map((p) => ({ method: p.method, amount: Number(p.amount) })));
  return { periodStart, now, salesCount: payments.length, ...summary };
}

export async function GET() {
  try {
    const gate = await requirePos('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const [shift, recent] = await Promise.all([
      currentShift(workspaceId),
      prisma.posCloseout.findMany({ where: { workspaceId }, orderBy: { closedAt: 'desc' }, take: 8 }),
    ]);
    return NextResponse.json({
      shift,
      recent: recent.map((c) => ({ id: c.id, closedAt: c.closedAt, periodStart: c.periodStart, salesCount: c.salesCount, totalSales: Number(c.totalSales), expectedCash: Number(c.expectedCash), countedCash: Number(c.countedCash), variance: Number(c.variance), notes: c.notes })),
    });
  } catch (e) {
    return posErrorResponse(e, 'closeout.get');
  }
}

const body = z.object({ countedCash: z.number().min(0).max(1_000_000_000), notes: z.string().trim().max(300).optional() });

/** Closes the shift: records what the till should hold against what was counted. A difference needs a note. */
export async function POST(req: Request) {
  try {
    const gate = await requirePos('checkout');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/pos/closeout', scope: workspaceId, max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = body.parse(await readJson(req));
    const shift = await currentShift(workspaceId);
    const variance = cashVariance(shift.expectedCash, d.countedCash);
    if (varianceNeedsNote(variance) && !d.notes) {
      return NextResponse.json({ code: 'NOTE_REQUIRED', error: 'The count is different from what the till should hold. Please add a note.', variance }, { status: 422 });
    }
    const row = await prisma.posCloseout.create({
      data: { workspaceId, userId, periodStart: shift.periodStart, closedAt: shift.now, salesCount: shift.salesCount, totalSales: shift.total, expectedCash: shift.expectedCash, countedCash: d.countedCash, variance, byMethodJson: shift.byMethod, notes: d.notes || null },
    });
    void logActivity({ workspaceId, action: 'pos.shift_closed', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'pos_closeout', id: row.id }, metadata: { expected: shift.expectedCash, counted: d.countedCash, variance, sales: shift.salesCount } });
    return NextResponse.json({ success: true, id: row.id, variance, expectedCash: shift.expectedCash });
  } catch (e) {
    return posErrorResponse(e, 'closeout.post');
  }
}
