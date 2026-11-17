import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runEmailHostingDaily } from '@/lib/email-billing/daily-run';

export const maxDuration = 300;

/**
 * Daily Email Hosting job: optional inventory sync, usage snapshots, trial conversion and quantity changes.
 * Schedule it before `process-retainers` so that day's invoices use the latest quantities.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    const results = await runEmailHostingDaily(new Date());
    const failed = results.filter((r) => r.error).length;
    return NextResponse.json({ workspaces: results.length, failed, results });
  } catch (error) {
    console.error('Email hosting cron failed:', error);
    return NextResponse.json({ error: 'Failed to run Email Hosting job' }, { status: 500 });
  }
}
