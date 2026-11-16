import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { posErrorResponse, requirePos } from '../_guard';

const query = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });

/** A trading day at the counter: takings, how they were paid, the best sellers, and the latest sales (each can print its receipt). */
export async function GET(request: Request) {
  try {
    const gate = await requirePos('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const now = new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 86_400_000);

    const sales = await prisma.invoice.findMany({
      where: { workspaceId, source: 'POS', status: { not: 'VOID' }, invoiceDate: { gte: from, lt: to } },
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true, taxAmount: true, status: true,
        client: { select: { name: true, isWalkIn: true } },
        items: { select: { description: true, quantity: true, totalAmount: true } },
        payments: { where: { reversedAt: null }, select: { method: true, amount: true } },
      },
      orderBy: { invoiceDate: 'desc' },
      take: 500,
    });

    const byMethod = new Map<string, { count: number; amount: number }>();
    const top = new Map<string, { name: string; qty: number; amount: number }>();
    let total = 0, tax = 0, units = 0;
    for (const s of sales) {
      total += Number(s.totalAmount);
      tax += Number(s.taxAmount);
      for (const p of s.payments) {
        const cur = byMethod.get(p.method) ?? { count: 0, amount: 0 };
        cur.count += 1; cur.amount += Number(p.amount);
        byMethod.set(p.method, cur);
      }
      for (const i of s.items) {
        units += i.quantity;
        const name = i.description.split(' - ')[0]!;
        const cur = top.get(name) ?? { name, qty: 0, amount: 0 };
        cur.qty += i.quantity; cur.amount += Number(i.totalAmount);
        top.set(name, cur);
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return NextResponse.json({
      from, to,
      totals: { count: sales.length, total: r2(total), tax: r2(tax), units, average: sales.length ? r2(total / sales.length) : 0 },
      byMethod: [...byMethod.entries()].map(([method, v]) => ({ method, count: v.count, amount: r2(v.amount) })).sort((a, b) => b.amount - a.amount),
      top: [...top.values()].sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => ({ ...t, amount: r2(t.amount) })),
      recent: sales.slice(0, 25).map((s) => ({ id: s.id, number: s.invoiceNumber, at: s.invoiceDate, customer: s.client && !s.client.isWalkIn ? s.client.name : null, total: Number(s.totalAmount), method: s.payments[0]?.method ?? null, status: s.status })),
    });
  } catch (e) {
    return posErrorResponse(e, 'summary');
  }
}
