import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';
import { mailBillingMapClientSchema, parseJsonBody } from '@/lib/email-billing/validation';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const domain = await prisma.mailBillingDomain.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!domain) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingMapClientSchema, await req.json().catch(() => ({})));
    if (body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: body.clientId, workspaceId: auth.workspaceId } });
      if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const updated = await prisma.mailBillingDomain.update({ where: { id }, data: { clientId: body.clientId || null, billingNotes: body.billingNotes ?? domain.billingNotes, billingMode: body.billingMode ?? domain.billingMode } });
    auditEmailBilling(auth, 'domain_client_mapped', { type: 'mail_billing_domain', id }, { clientId: body.clientId || null }, req);
    return NextResponse.json({ domain: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid mapping' }, { status: 400 }); }
}
