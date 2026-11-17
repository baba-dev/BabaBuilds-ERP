import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { processDueOperations } from '@/lib/email-billing/ops/service';

export const maxDuration = 300;

/** Runs scheduled mailbox deletes and retries failed server operations. Schedule every 5 minutes. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    return NextResponse.json(await processDueOperations(new Date()));
  } catch (error) {
    console.error('Email hosting operations cron failed:', error);
    return NextResponse.json({ error: 'Failed to process operations' }, { status: 500 });
  }
}
