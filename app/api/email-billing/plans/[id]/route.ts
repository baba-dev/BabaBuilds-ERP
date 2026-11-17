import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../_lib/auth';
import { auditEmailBilling } from '../../_lib/audit';
import { mailBillingPlanPatchSchema, parseJsonBody } from '@/lib/email-billing/validation';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const plan = await prisma.mailBillingPlan.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { subscriptions: { include: { domain: true, client: true } } } });
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ plan });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.mailBillingPlan.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingPlanPatchSchema, await req.json().catch(() => ({})));
    const plan = await prisma.mailBillingPlan.update({ where: { id }, data: { ...body, description: body.description === undefined ? undefined : body.description ?? null } });
    auditEmailBilling(auth, 'plan_updated', { type: 'mail_billing_plan', id }, { fields: Object.keys(body) }, req);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid plan update' }, { status: 400 });
  }
}
