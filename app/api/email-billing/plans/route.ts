import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';
import { auditEmailBilling } from '../_lib/audit';
import { mailBillingPlanCreateSchema, parseJsonBody } from '@/lib/email-billing/validation';

export async function GET() {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ plans: await prisma.mailBillingPlan.findMany({ where: { workspaceId: auth.workspaceId }, include: { _count: { select: { subscriptions: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }) });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  try {
    const body = parseJsonBody(mailBillingPlanCreateSchema, await req.json().catch(() => ({})));
    const plan = await prisma.mailBillingPlan.create({ data: { workspaceId: auth.workspaceId, ...body, description: body.description ?? null } });
    auditEmailBilling(auth, 'plan_created', { type: 'mail_billing_plan', id: plan.id }, { name: plan.name, billingMode: plan.billingMode, currency: plan.currency }, req);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid plan' }, { status: 400 });
  }
}
