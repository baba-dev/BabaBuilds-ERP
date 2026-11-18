import { NextRequest, NextResponse } from 'next/server';
import { checkPermissionsSilent } from '@/lib/rbac';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requireEmailBilling } from '../../_lib/auth';
import { previewBulkSetup, runBulkSetup } from '@/lib/email-billing/bulk-setup';
import { SetupBillingError } from '@/lib/email-billing/setup';
import { mailBillingBulkSetupSchema } from '@/lib/email-billing/validation';

/**
 * Sets up billing for many domains at once. `preview` changes nothing and shows what would happen; `apply` handles up to
 * 200 domains per call (call again for the rest). Invoice emails stay off unless asked for.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.create' });
  if ('response' in auth) return auth.response;
  const parsed = mailBillingBulkSetupSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  const body = parsed.data;

  if (body.mode === 'apply') {
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/email-billing/billing/bulk-setup', scope: auth.workspaceId, max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
  }
  if (body.createClients) {
    const granted = await checkPermissionsSilent(auth.userId, auth.workspaceId, ['clients.manage'] as const);
    if (!granted['clients.manage']) return NextResponse.json({ error: 'You need permission to manage clients to create them in bulk.' }, { status: 403 });
  }
  const input = {
    workspaceId: auth.workspaceId, userId: auth.userId, planId: body.planId, startDateSource: body.startDateSource,
    startDate: body.startDate ? new Date(body.startDate) : undefined, createClients: body.createClients, emailInvoices: body.emailInvoices, domainIds: body.domainIds,
  };
  try {
    return NextResponse.json(body.mode === 'preview' ? { preview: await previewBulkSetup(input) } : { applied: await runBulkSetup(input) });
  } catch (error) {
    if (error instanceof SetupBillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Email hosting bulk billing setup failed:', error);
    return NextResponse.json({ error: 'Could not set up billing' }, { status: 500 });
  }
}
