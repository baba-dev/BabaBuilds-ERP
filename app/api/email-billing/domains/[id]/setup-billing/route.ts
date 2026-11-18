import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkPermissionsSilent } from '@/lib/rbac';
import { createClient } from '@/lib/clients/service';
import { requireEmailBilling } from '../../../_lib/auth';
import { setupDomainBilling, SetupBillingError } from '@/lib/email-billing/setup';
import { mailBillingSetupBillingSchema } from '@/lib/email-billing/validation';

/** Starts billing for a domain: client, plan, issue date and the recurring retainer, in one step. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.create' });
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const parsed = mailBillingSetupBillingSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  const body = parsed.data;

  try {
    let clientId = body.clientId;
    if (body.newClient) {
      const granted = await checkPermissionsSilent(auth.userId, auth.workspaceId, ['clients.manage'] as const);
      if (!granted['clients.manage']) return NextResponse.json({ error: 'You need permission to manage clients to add a new one.' }, { status: 403 });
      const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { countryCode: true } });
      const created = await createClient(
        { workspaceId: auth.workspaceId, userId: auth.userId, email: auth.session.user?.email ?? null, name: auth.session.user?.name ?? '', workspaceCountry: workspace?.countryCode ?? '' },
        { name: body.newClient.name, email: body.newClient.email || null, country: workspace?.countryCode ?? '', countryCode: workspace?.countryCode ?? null },
        { source: 'MANUAL' },
      );
      if (!created.ok) return NextResponse.json({ error: created.message, code: created.code, ...(created.extra ?? {}) }, { status: created.status });
      clientId = created.client.id;
    }
    const result = await setupDomainBilling({
      workspaceId: auth.workspaceId, userId: auth.userId, domainId: id, planId: body.planId, clientId: clientId!,
      startDate: body.startDate ? new Date(body.startDate) : undefined, trialDays: body.trialDays,
      firstBillingDate: body.firstBillingDate ? new Date(body.firstBillingDate) : undefined, emailInvoices: body.emailInvoices,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof SetupBillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Email hosting billing setup failed:', error);
    return NextResponse.json({ error: 'Could not set up billing' }, { status: 500 });
  }
}
