/**
 * PATCH /api/notifications/mark-read
 * Marks specific notifications (or all unread) as read.
 *
 * Body:
 *   { ids: string[] }          — mark specific IDs
 *   { all: true }              — mark all unread as read
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json() as { ids?: string[]; all?: boolean };

    if (body.all) {
      await prisma.inAppNotification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
    } else if (body.ids && body.ids.length > 0) {
      await prisma.inAppNotification.updateMany({
        where: { userId: user.id, id: { in: body.ids } },
        data: { isRead: true, readAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications/mark-read] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
