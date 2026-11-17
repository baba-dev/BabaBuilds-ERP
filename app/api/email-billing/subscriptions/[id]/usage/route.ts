import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';

const SNAPSHOT_DAYS = 90;

/** Usage history, quantity changes and the invoices of the linked retainer, so a bill can be traced to the usage behind it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const sub = await prisma.mailBillingSubscription.findFirst({ where: { id, workspaceId: auth.workspaceId }, select: { id: true, retainerId: true } });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const since = new Date(Date.now() - SNAPSHOT_DAYS * 86_400_000);
  const [snapshots, changes, invoices, prorations] = await Promise.all([
    prisma.mailUsageSnapshot.findMany({ where: { subscriptionId: id, capturedOn: { gte: since } }, orderBy: { capturedOn: 'desc' } }),
    prisma.mailBillingChange.findMany({ where: { subscriptionId: id, workspaceId: auth.workspaceId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    sub.retainerId
      ? prisma.invoice.findMany({ where: { workspaceId: auth.workspaceId, retainerId: sub.retainerId }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, invoiceNumber: true, status: true, grandTotal: true, currency: true, dueDate: true, createdAt: true } })
      : Promise.resolve([]),
    sub.retainerId
      ? prisma.meteredUsage.findMany({ where: { retainerId: sub.retainerId, description: { startsWith: 'Prorated:' } }, orderBy: { createdAt: 'desc' }, take: 24, select: { id: true, description: true, unitPrice: true, status: true, billedInInvoiceId: true, createdAt: true } })
      : Promise.resolve([]),
  ]);
  return NextResponse.json({ snapshots, changes, invoices, prorations });
}
