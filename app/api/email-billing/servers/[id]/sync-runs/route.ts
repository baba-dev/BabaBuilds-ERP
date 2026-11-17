import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const server = await prisma.mailBillingServer.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!server) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const syncRuns = await prisma.mailBillingSyncRun.findMany({ where: { workspaceId: auth.workspaceId, serverId: id }, orderBy: { startedAt: 'desc' }, take: 50 });
  return NextResponse.json({ syncRuns });
}
