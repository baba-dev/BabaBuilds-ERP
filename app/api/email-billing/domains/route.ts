import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';

export async function GET() {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const domains = await prisma.mailBillingDomain.findMany({
    where: { workspaceId: auth.workspaceId },
    include: {
      server: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      subscriptions: { include: { plan: true, retainer: true } },
      mailboxes: { orderBy: { email: 'asc' } },
    },
    orderBy: { domain: 'asc' },
  });
  return NextResponse.json({ domains });
}
