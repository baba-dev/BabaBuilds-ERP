import { NextRequest, NextResponse } from 'next/server';
import { requireEmailBilling } from '../../_lib/auth';
import { markCollectedThrough, setChargingStart } from '@/lib/email-billing/collections';
import { mailBillingDatesSchema } from '@/lib/email-billing/validation';
import { collectionErrorResponse } from '../_lib';

/**
 * Sets the opening position for addresses that existed before the ERP: the first day they are charged
 * (`chargingStart`, only for addresses nothing has been collected from) or the day they were already paid up to
 * (`collectedThrough`, forward only). Returns how many addresses changed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const parsed = mailBillingDatesSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  const { kind, scope, date } = parsed.data;
  try {
    const args = { workspaceId: auth.workspaceId, userId: auth.userId, scope, date: new Date(date) };
    const changed = kind === 'chargingStart' ? await setChargingStart(args) : await markCollectedThrough(args);
    return NextResponse.json({ changed });
  } catch (error) {
    return collectionErrorResponse(error, 'opening dates');
  }
}
