/**
 * GET /api/cron/payroll-reminders
 *
 * Daily job: a nudge to run payroll in time, a reminder when a run has waited for approval, and PF / ESI / professional tax /
 * TDS due-date reminders (3 and 1 days before, on the day, and every Monday while overdue).
 *
 *   0 7 * * * curl -s https://yourdomain.com/api/cron/payroll-reminders -H "Authorization: Bearer $CRON_SECRET"
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runPayrollReminders } from '@/lib/payroll/service/reminders';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    return NextResponse.json({ ok: true, ...(await runPayrollReminders()) });
  } catch (error) {
    console.error('Payroll reminders cron error:', error);
    return NextResponse.json({ error: 'Payroll reminders failed' }, { status: 500 });
  }
}
