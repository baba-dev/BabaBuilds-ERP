/**
 * lib/shop/ai-tools.ts
 *
 * Tool implementations for the Groq-driven AI chatbot, scoped to the public
 * Shop subsystem. All tools require the SHOP module to be enabled and an
 * authenticated workspace context — gating is handled by the chat route.
 */

import { prisma } from '@/lib/prisma';

const ORDER_LOOKBACK_DAYS = 30;
const TOP_PRODUCTS_LIMIT = 5;

function dayWindow(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Numeric coercion that survives Prisma Decimal values. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    try { return (value as { toNumber: () => number }).toNumber(); } catch { /* noop */ }
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getShopSummary(workspaceId: string): Promise<string> {
  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { shopEnabled: true, shopSlug: true, companyName: true },
  });

  if (!profile) {
    return JSON.stringify({ error: 'Business profile not found.' });
  }

  const { start } = dayWindow(ORDER_LOOKBACK_DAYS);

  const [statusCounts, paidAgg, pendingAgg, recent] = await Promise.all([
    prisma.shopOrder.groupBy({
      by: ['status'],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.shopOrder.aggregate({
      where: { workspaceId, status: { in: ['PAID', 'SHIPPED', 'FULFILLED'] } },
      _sum: { amount: true },
    }),
    prisma.shopOrder.aggregate({
      where: { workspaceId, status: 'PENDING' },
      _sum: { amount: true },
    }),
    prisma.shopOrder.findMany({
      where: { workspaceId, createdAt: { gte: start } },
      select: { id: true, buyerName: true, status: true, amount: true, currency: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const counts = { PAID: 0, PENDING: 0, FAILED: 0, REFUNDED: 0, FULFILLED: 0, SHIPPED: 0, REFUND_DUE: 0 };
  for (const row of statusCounts) {
    if (row.status in counts) counts[row.status as keyof typeof counts] = row._count._all;
  }

  return JSON.stringify({
    enabled: Boolean(profile.shopEnabled),
    slug: profile.shopSlug || null,
    publicUrl: profile.shopSlug ? `/shop/${profile.shopSlug}` : null,
    company: profile.companyName,
    statusCounts: counts,
    paidRevenueLifetimeINR: toNumber(paidAgg._sum.amount),
    pendingPipelineINR: toNumber(pendingAgg._sum.amount),
    last30Days: {
      orders: recent.length,
    },
    recentOrders: recent.map((o) => ({
      id: o.id,
      buyerName: o.buyerName,
      status: o.status,
      amount: `${o.currency} ${toNumber(o.amount).toFixed(2)}`,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}

export async function getTopShopProducts(workspaceId: string): Promise<string> {
  const { start } = dayWindow(ORDER_LOOKBACK_DAYS);

  // Sum quantities and revenue per productId across PAID orders in the window.
  const items = await prisma.shopOrderItem.findMany({
    where: {
      shopOrder: {
        workspaceId,
        status: { in: ['PAID', 'SHIPPED', 'FULFILLED'] },
        createdAt: { gte: start },
      },
    },
    select: {
      productId: true,
      productName: true,
      quantity: true,
      lineTotal: true,
    },
  });

  const aggregate = new Map<string, { name: string; units: number; revenue: number }>();
  for (const item of items) {
    const key = item.productId;
    const entry = aggregate.get(key) ?? { name: item.productName, units: 0, revenue: 0 };
    entry.units += item.quantity;
    entry.revenue += toNumber(item.lineTotal);
    aggregate.set(key, entry);
  }

  const sorted = Array.from(aggregate.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_PRODUCTS_LIMIT);

  return JSON.stringify({
    windowDays: ORDER_LOOKBACK_DAYS,
    topProducts: sorted.map((p) => ({
      name: p.name,
      unitsSold: p.units,
      revenueINR: Number(p.revenue.toFixed(2)),
    })),
  });
}

export async function setShopStatus(workspaceId: string, enabled: boolean): Promise<string> {
  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { shopEnabled: true, shopSlug: true },
  });
  if (!profile) {
    return JSON.stringify({ error: 'Business profile not configured. Open Settings first.' });
  }
  if (enabled && !profile.shopSlug) {
    return JSON.stringify({
      error:
        'Shop slug not set. Pick a slug in Settings → Public Shop before enabling the storefront.',
    });
  }
  await prisma.businessProfile.update({
    where: { workspaceId },
    data: { shopEnabled: enabled },
  });
  return JSON.stringify({
    status: 'ok',
    shopEnabled: enabled,
    publicUrl: profile.shopSlug ? `/shop/${profile.shopSlug}` : null,
  });
}

export async function updateShopAnnouncement(
  workspaceId: string,
  announcement: string | null,
): Promise<string> {
  const trimmed = (announcement ?? '').trim();
  const value = trimmed === '' ? null : trimmed.slice(0, 240);
  await prisma.businessProfile.update({
    where: { workspaceId },
    data: { shopAnnouncement: value },
  });
  return JSON.stringify({
    status: 'ok',
    announcement: value,
  });
}
