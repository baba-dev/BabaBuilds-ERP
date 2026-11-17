import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.mailBillingReviewItem.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const item = await prisma.mailBillingReviewItem.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: auth.userId } });
  auditEmailBilling(auth, 'review_resolved', { type: 'mail_billing_review_item', id }, { type: existing.type }, req);
  return NextResponse.json({ item });
}
