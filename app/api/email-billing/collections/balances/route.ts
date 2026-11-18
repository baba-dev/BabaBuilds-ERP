import { NextRequest, NextResponse } from 'next/server';
import { requireEmailBilling } from '../../_lib/auth';
import { listBalances } from '@/lib/email-billing/collections';
import { collectionErrorResponse, parseDay } from '../_lib';

/** What every client owes as of a day (default today), biggest first. Read-only. */
export async function GET(req: NextRequest) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const asOf = parseDay(req.nextUrl.searchParams.get('asOf'));
  if (!asOf) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  try {
    return NextResponse.json(await listBalances(auth.workspaceId, asOf));
  } catch (error) {
    return collectionErrorResponse(error, 'balances');
  }
}
