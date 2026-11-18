import { NextResponse } from 'next/server';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED = ['PENDING', 'CLAIMED', 'PROVIDER_ACCEPTED', 'UNCERTAIN', 'FAILED', 'SUPPRESSED'] as const;
const CHANNELS = ['EMAIL', 'PUSH', 'REPORT_EMAIL'] as const;

/** No PII, report payload, recipient hash, claim token or SMTP secret is exposed. */
export async function GET(request: Request) {
  try {
    const admin = await verifySuperAdmin();
    const limit = await enforceRouteRateLimit({
      request, route: '/api/admin/jobs/deliveries', scope: admin.userId,
      max: 60, windowMs: 60_000,
    });
    if (!limit.ok) return limit.response;
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const channel = params.get('channel');
    const workspaceId = params.get('workspaceId');
    if ((status && !ALLOWED.some((s) => s === status)) ||
        (channel && !CHANNELS.some((c) => c === channel)) ||
        (workspaceId && !/^[A-Za-z0-9_-]{8,80}$/.test(workspaceId))) {
      return NextResponse.json({ code: 'INVALID_FILTER' }, { status: 400 });
    }
    const where = {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    };
    const [items, grouped] = await Promise.all([
      prisma.erpJobDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 75,
        select: {
          id: true, workspaceId: true, eventKind: true, channel: true, status: true,
          attempts: true, createdAt: true, updatedAt: true, acceptedAt: true,
          externalAttemptedAt: true, leaseExpiresAt: true, lastErrorCode: true,
        },
      }),
      prisma.erpJobDelivery.groupBy({
        by: ['status', 'channel'], where,
        _count: { _all: true },
      }),
    ]);
    return NextResponse.json({
      items, summary: grouped.map((g) => ({
        status: g.status, channel: g.channel, count: g._count._all,
      })),
      maxItems: 75,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleAdminApiError(error, 'Delivery recovery unavailable');
  }
}
