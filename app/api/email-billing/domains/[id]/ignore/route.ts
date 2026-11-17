import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.mailBillingDomain.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const domain = await prisma.mailBillingDomain.update({ where: { id }, data: { status: 'IGNORED' } });
  auditEmailBilling(auth, 'domain_ignored', { type: 'mail_billing_domain', id }, { from: existing.status }, req);
  return NextResponse.json({ domain });
}
