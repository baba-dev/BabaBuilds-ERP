import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const plan = await prisma.mailBillingPlan.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.mailBillingPlan.update({ where: { id }, data: { isActive: false } });
  auditEmailBilling(auth, 'plan_deactivated', { type: 'mail_billing_plan', id }, { name: plan.name }, req);
  return NextResponse.json({ plan: updated });
}
