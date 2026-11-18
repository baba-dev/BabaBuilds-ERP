import { NextRequest, NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../_lib/auth';
import { requireInvoicePermissions } from '../../../_lib/invoice-permissions';
import { recordCollectionPaymentLater } from '@/lib/email-billing/collections';
import { mailBillingCollectionPaymentSchema } from '@/lib/email-billing/validation';
import { collectionErrorResponse } from '../../_lib';

/** Records the money for a collection's invoice when it arrives after the collection was made. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.edit' });
  if ('response' in auth) return auth.response;
  const denied = await requireInvoicePermissions(auth, ['invoices.edit']);
  if (denied) return denied;
  const parsed = mailBillingCollectionPaymentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json({ payment: await recordCollectionPaymentLater({ workspaceId: auth.workspaceId, userId: auth.userId, collectionId: id, payment: parsed.data }) }, { status: 201 });
  } catch (error) {
    return collectionErrorResponse(error, 'collection payment');
  }
}
