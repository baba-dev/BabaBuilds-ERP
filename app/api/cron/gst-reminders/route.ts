/**
 * GET /api/cron/gst-reminders
 *
 * Daily job: due-date reminders (7, 3, 1 days before and on the day; weekly once overdue) and a Monday digest of what
 * is blocking filing. In-app, push and email follow each user's notification preferences.
 *
 *   30 7 * * * curl -s https://yourdomain.com/api/cron/gst-reminders -H "Authorization: Bearer $CRON_SECRET"
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runGstReminders } from '@/lib/gst/reminders';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    return NextResponse.json({ ok: true, ...(await runGstReminders()) });
  } catch (error) {
    console.error('GST reminders cron error:', error);
    return NextResponse.json({ error: 'GST reminders failed' }, { status: 500 });
  }
}
