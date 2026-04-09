/**
 * GET /api/notifications/unread
 * Returns unread in-app notifications for the authenticated user.
 * Used by the polling hook to drive Sonner toasts + Bell badge.
 *
 * Query params:
 *   limit   — max items to return (default 20)
 *   since   — ISO timestamp; only return items newer than this (optional)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);
    const since = searchParams.get('since');

    const notifications = await prisma.inAppNotification.findMany({
      where: {
        userId: user.id,
        isRead: false,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const totalUnread = await prisma.inAppNotification.count({
      where: { userId: user.id, isRead: false },
    });

    return NextResponse.json({ notifications, totalUnread });
  } catch (err) {
    console.error('[notifications/unread] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
