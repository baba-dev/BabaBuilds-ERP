import { NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../_lib/auth';
import { requireInvoicePermissions } from '../../../_lib/invoice-permissions';
import { recoverCollection } from '@/lib/email-billing/collections';
import { collectionErrorResponse } from '../../_lib';

/** Finishes a collection that was recorded but never got its invoice (for example after a crash). Never invoices twice. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.create' });
  if ('response' in auth) return auth.response;
  const denied = await requireInvoicePermissions(auth, ['invoices.create']);
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json({ collection: await recoverCollection({ workspaceId: auth.workspaceId, userId: auth.userId, collectionId: id }) });
  } catch (error) {
    return collectionErrorResponse(error, 'collection recovery');
  }
}
