import { NextRequest, NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../../_lib/auth';
import { buildStatement } from '@/lib/email-billing/collections';
import { collectionErrorResponse, parseDay } from '../../../_lib';

/** What one client owes as of a day, address by address. Read-only; nothing is charged. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const { clientId } = await params;
  const asOf = parseDay(req.nextUrl.searchParams.get('asOf'));
  if (!asOf) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  try {
    return NextResponse.json({ statement: await buildStatement(auth.workspaceId, clientId, asOf) });
  } catch (error) {
    return collectionErrorResponse(error, 'statement');
  }
}
