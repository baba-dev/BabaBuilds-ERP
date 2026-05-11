import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-ip';
import { headers } from 'next/headers';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: {
      userId: (session.user as any).id,
    },
    orderBy: {
      expires: 'desc',
    },
    take: 5,
  });

  // In a real app, we'd store User-Agent and IP in the session table.
  // For this demo/ERP, we'll simulate some metadata based on current request
  // and generic placeholders for existing sessions.
  const reqHeaders = await headers();
  const currentIp = getClientIp(reqHeaders);
  const currentUserAgent = reqHeaders.get('user-agent') || 'Unknown Device';

  const enrichedSessions = sessions.map((s) => ({
    id: s.id,
    expires: s.expires,
    isCurrent: s.sessionToken === (session as any).sessionToken, // NextAuth might not expose this easily in JWT mode
    ip: currentIp, // Placeholder
    userAgent: currentUserAgent, // Placeholder
    lastSeen: new Date(),
  }));

  return NextResponse.json(enrichedSessions);
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('id');

  if (!sessionId) {
    return new Response('Missing session ID', { status: 400 });
  }

  await prisma.session.delete({
    where: {
      id: sessionId,
      userId: (session.user as any).id,
    },
  });

  return new Response(null, { status: 204 });
}
