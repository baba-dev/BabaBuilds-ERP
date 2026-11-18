import { NextRequest, NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../_lib/auth';
import { requireInvoicePermissions } from '../../../_lib/invoice-permissions';
import { undoCollection } from '@/lib/email-billing/collections';
import { mailBillingUndoCollectionSchema } from '@/lib/email-billing/validation';
import { collectionErrorResponse } from '../../_lib';

/** Voids a client's latest collection and gives the days back. Needs the permission to void invoices. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.delete' });
  if ('response' in auth) return auth.response;
  const denied = await requireInvoicePermissions(auth, ['invoices.delete']);
  if (denied) return denied;
  const parsed = mailBillingUndoCollectionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Give a reason (at least 3 characters).' }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await undoCollection({ workspaceId: auth.workspaceId, userId: auth.userId, collectionId: id, reason: parsed.data.reason }));
  } catch (error) {
    return collectionErrorResponse(error, 'collection undo');
  }
}
