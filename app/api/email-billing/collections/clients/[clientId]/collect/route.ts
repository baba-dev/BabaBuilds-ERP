import { NextRequest, NextResponse } from 'next/server';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requireEmailBilling } from '../../../../_lib/auth';
import { requireInvoicePermissions } from '../../../../_lib/invoice-permissions';
import { collectFromClient } from '@/lib/email-billing/collections';
import { mailBillingCollectSchema } from '@/lib/email-billing/validation';
import { collectionErrorResponse } from '../../../_lib';

/**
 * Collects what a client owes up to a day (default today): one invoice for all their domains, and optionally the payment
 * recorded at once. Needs permission to create invoices, and to record payments when `payment` is given.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.create' });
  if ('response' in auth) return auth.response;
  const parsed = mailBillingCollectSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  const body = parsed.data;
  const denied = await requireInvoicePermissions(auth, body.payment ? ['invoices.create', 'invoices.edit'] : ['invoices.create']);
  if (denied) return denied;
  const limit = await enforceRouteRateLimit({ request: req, route: '/api/email-billing/collections/collect', scope: auth.workspaceId, max: 60, windowMs: 10 * 60_000 });
  if (!limit.ok) return limit.response;
  const { clientId } = await params;
  try {
    const outcome = await collectFromClient({
      workspaceId: auth.workspaceId, userId: auth.userId, clientId, asOf: body.asOf ? new Date(body.asOf) : new Date(),
      currency: body.currency, idempotencyKey: body.idempotencyKey, expectedTotal: body.expectedTotal, payment: body.payment,
    });
    return NextResponse.json({ collection: outcome }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return collectionErrorResponse(error, 'collection');
  }
}
