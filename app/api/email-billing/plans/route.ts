import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';
import { mailBillingPlanCreateSchema, parseJsonBody } from '@/lib/email-billing/validation';

export async function GET() {
  const auth = await requireEmailBilling('invoices.view');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ plans: await prisma.mailBillingPlan.findMany({ where: { workspaceId: auth.workspaceId }, include: { _count: { select: { subscriptions: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }) });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('invoices.edit');
  if ('response' in auth) return auth.response;
  try {
    const body = parseJsonBody(mailBillingPlanCreateSchema, await req.json().catch(() => ({})));
    const plan = await prisma.mailBillingPlan.create({ data: { workspaceId: auth.workspaceId, ...body, description: body.description ?? null } });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid plan' }, { status: 400 });
  }
}
