import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runDueSchedules } from '@/lib/reporting/views';

/** Emails every saved report whose schedule is due (weekly on Mondays, monthly on the 1st). Run it daily around 06:30 UTC. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    return NextResponse.json({ ok: true, ...(await runDueSchedules()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[cron/report-schedules]', error);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
