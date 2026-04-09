/**
 * POST /api/notifications/push/subscribe
 * Registers a user's browser Push subscription (or refreshes an existing one).
 *
 * DELETE /api/notifications/push/subscribe
 * Unregisters a subscription by endpoint.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    };

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }

    // Upsert so re-registering an existing endpoint just refreshes keys
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
        userId: user.id,
      },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { endpoint: string };
    if (!body.endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET /api/notifications/push/subscribe — Returns the current VAPID public key */
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  });
}
