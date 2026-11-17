import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { applyBillableQuantity } from '@/lib/email-billing/quantity';
import { mailBillingApplyQuantitySchema, parseJsonBody } from '@/lib/email-billing/validation';

/**
 * Approves a mailbox-count change: updates the subscription and its retainer lines and queues the prorated charge
 * for increases. With no body it applies the pending count the daily job queued for review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const sub = await prisma.mailBillingSubscription.findFirst({ where: { id, workspaceId: auth.workspaceId }, select: { id: true, pendingMailboxCount: true, billingStatus: true } });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sub.billingStatus === 'CANCELLED') return NextResponse.json({ error: 'A cancelled subscription cannot be changed' }, { status: 409 });
  try {
    const body = parseJsonBody(mailBillingApplyQuantitySchema, await req.json().catch(() => ({})));
    const toCount = body.toCount ?? sub.pendingMailboxCount;
    if (toCount === null || toCount === undefined) return NextResponse.json({ error: 'No pending mailbox count to apply' }, { status: 400 });
    const source = body.toCount === undefined || body.toCount === sub.pendingMailboxCount ? 'APPROVED' : 'MANUAL';
    const result = await applyBillableQuantity({ workspaceId: auth.workspaceId, subscriptionId: id, toCount, source, actorUserId: auth.userId });
    if (!result.changed && result.reason === 'CONFLICT') return NextResponse.json({ error: 'The subscription changed while applying; try again' }, { status: 409 });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
  }
}
