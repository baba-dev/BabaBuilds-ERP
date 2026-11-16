import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

/**
 * GET /api/shop/check-slug?slug=myshop
 * Public endpoint — checks if a shop slug is available.
 */
export async function GET(request: Request) {
  const limit = enforceRouteRateLimit({ request, route: '/api/shop/check-slug', scope: 'public', max: 60, windowMs: 60_000 });
  if (!limit.ok) return limit.response;
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug')?.toLowerCase().trim();

  if (!slug) return NextResponse.json({ error: 'Slug is required' }, { status: 400 });

  // Validate format: lowercase alphanumeric + hyphens, 3-40 chars
  const slugRegex = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  if (!slugRegex.test(slug)) {
    return NextResponse.json({ available: false, reason: 'invalid_format' });
  }

  // Reserved slugs
  const RESERVED = ['admin', 'api', 'app', 'shop', 'dashboard', 'login', 'help', 'billing', 'support', 'www'];
  if (RESERVED.includes(slug)) {
    return NextResponse.json({ available: false, reason: 'reserved' });
  }

  const existing = await prisma.businessProfile.findUnique({ where: { shopSlug: slug } });
  return NextResponse.json({ available: !existing, reason: existing ? 'taken' : null });
}
