import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { posErrorResponse, readJson, requirePos } from '../_guard';

const MAX_HOLDS = 25;

const line = z.object({
  id: z.string().max(60), type: z.enum(['SERVICE', 'PRODUCT', 'CUSTOM']), name: z.string().max(200), price: z.number().min(0), quantity: z.number().int().min(1).max(100000),
  taxRate: z.number().min(0).max(100).optional(), description: z.string().max(1000).optional(),
}).strip();

const body = z.object({
  label: z.string().trim().max(60).optional(),
  clientId: z.string().max(40).optional().nullable(),
  discount: z.number().min(0).optional(),
  cart: z.array(line).min(1).max(100),
  total: z.number().min(0),
}).strict();

export async function GET() {
  try {
    const gate = await requirePos('checkout');
    if ('response' in gate) return gate.response;
    const rows = await prisma.posHeldSale.findMany({ where: { workspaceId: gate.access.workspaceId }, orderBy: { createdAt: 'desc' }, take: MAX_HOLDS });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, label: r.label, clientId: r.clientId, itemCount: r.itemCount, total: Number(r.total), createdAt: r.createdAt, mine: r.userId === gate.access.userId, cart: r.cartJson })) });
  } catch (e) {
    return posErrorResponse(e, 'holds.list');
  }
}

/** Puts a sale on hold so another customer can be served. */
export async function POST(req: Request) {
  try {
    const gate = await requirePos('checkout');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/pos/holds', scope: workspaceId, max: 60, windowMs: 60_000 });
    if (!limit.ok) return limit.response;
    const d = body.parse(await readJson(req));
    if ((await prisma.posHeldSale.count({ where: { workspaceId } })) >= MAX_HOLDS) {
      return NextResponse.json({ code: 'TOO_MANY_HOLDS', error: `There are already ${MAX_HOLDS} sales on hold. Finish or discard one first.` }, { status: 409 });
    }
    const hold = await prisma.posHeldSale.create({
      data: { workspaceId, userId, label: d.label || null, clientId: d.clientId || null, cartJson: { lines: d.cart, discount: d.discount ?? 0 }, itemCount: d.cart.reduce((s, l) => s + l.quantity, 0), total: d.total },
    });
    return NextResponse.json({ success: true, id: hold.id }, { status: 201 });
  } catch (e) {
    return posErrorResponse(e, 'holds.create');
  }
}
