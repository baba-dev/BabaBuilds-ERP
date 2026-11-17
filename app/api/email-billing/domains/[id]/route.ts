import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../_lib/auth';
import { auditEmailBilling } from '../../_lib/audit';
import { mailBillingDomainPatchSchema, parseJsonBody } from '@/lib/email-billing/validation';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const domain = await prisma.mailBillingDomain.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: {
      server: true,
      client: true,
      retainer: true,
      subscriptions: { include: { plan: true, retainer: { include: { items: true } }, reviewItems: true } },
      mailboxes: { orderBy: { email: 'asc' } },
      reviewItems: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!domain) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ domain });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.mailBillingDomain.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingDomainPatchSchema, await req.json().catch(() => ({})));
    const domain = await prisma.mailBillingDomain.update({
      where: { id },
      data: { status: body.status ?? existing.status, billingNotes: body.billingNotes ?? existing.billingNotes },
    });
    auditEmailBilling(auth, 'domain_updated', { type: 'mail_billing_domain', id }, { fields: Object.keys(body), status: domain.status }, req);
    return NextResponse.json({ domain });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid domain update' }, { status: 400 });
  }
}
