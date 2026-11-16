import 'server-only';

import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { toPaymentSchedule } from '@/lib/payroll/settings';

export type PayrollReminder = { key: string; title: string; body: string; actionUrl: string };

const DAY = 86_400_000;
const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const daysUntil = (to: Date, now: Date) => Math.round((startOfDay(to) - startOfDay(now)) / DAY);

/** Works out which payroll nudges are due today. Pure, so the timing rules are testable without a database. */
export function planPayrollReminders(args: {
  now: Date;
  payDay: number;
  processingOffsetDays: number;
  currentMonthRun: { status: string } | null;
  hasPeople: boolean;
  dues: { kind: string; amount: number; dueDate: Date }[];
  reviewWaitingSince: Date | null;
}): PayrollReminder[] {
  const out: PayrollReminder[] = [];
  const { now } = args;
  const dom = now.getUTCDate();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const payDay = Math.min(Math.max(1, args.payDay), monthEnd);
  const startBy = payDay - Math.max(0, args.processingOffsetDays);

  // Start the run in time: on the processing day, and again two days later if nothing has been started.
  if (args.hasPeople && !args.currentMonthRun && (dom === startBy || dom === startBy + 2) && dom <= payDay) {
    out.push({ key: `start:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}:${dom}`, title: 'Time to run payroll', body: `Salaries are due on the ${payDay}th. Calculate this month's payroll so there is time to review and approve it.`, actionUrl: '/payroll' });
  }
  if (args.reviewWaitingSince && Math.floor((startOfDay(now) - startOfDay(args.reviewWaitingSince)) / DAY) >= 2) {
    out.push({ key: `approve:${now.toISOString().slice(0, 10)}`, title: 'Payroll is waiting for approval', body: 'A payroll run has been in review for two days or more.', actionUrl: '/payroll' });
  }
  for (const d of args.dues) {
    const left = daysUntil(d.dueDate, now);
    const money = d.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    if (left === 3 || left === 1 || left === 0) out.push({ key: `due:${d.kind}:${left}`, title: `${d.kind} payment ${left === 0 ? 'is due today' : `is due in ${left} day${left === 1 ? '' : 's'}`}`, body: `INR ${money} deducted from salaries is owed to government.`, actionUrl: '/payroll?tab=statutory' });
    else if (left < 0 && now.getUTCDay() === 1) out.push({ key: `overdue:${d.kind}`, title: `${d.kind} payment is overdue`, body: `INR ${money} was due ${-left} day${left === -1 ? '' : 's'} ago. Late payment attracts interest.`, actionUrl: '/payroll?tab=statutory' });
  }
  return out;
}

/** Daily job: payroll nudges for every workspace that uses payroll. */
export async function runPayrollReminders(now = new Date()) {
  const workspaces = await prisma.employeeCompensation.findMany({ distinct: ['workspaceId'], select: { workspaceId: true }, take: 5000 });
  let sent = 0;
  let skipped = 0;
  for (const { workspaceId } of workspaces) {
    try {
      if (!(await isModuleEnabled(workspaceId, 'PAYROLL'))) { skipped += 1; continue; }
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [settings, period, dues, review] = await Promise.all([
        prisma.payrollSettings.findUnique({ where: { workspaceId }, select: { paymentScheduleJson: true } }),
        prisma.payrollPeriod.findFirst({ where: { workspaceId, startDate: monthStart }, select: { runs: { orderBy: { version: 'desc' }, take: 1, select: { status: true } } } }),
        prisma.payrollRemittance.findMany({ where: { workspaceId, status: 'DUE' }, select: { kind: true, amount: true, dueDate: true }, take: 40 }),
        prisma.payrollRun.findFirst({ where: { workspaceId, status: 'REVIEW' }, orderBy: { submittedAt: 'asc' }, select: { submittedAt: true } }),
      ]);
      const sched = toPaymentSchedule(settings?.paymentScheduleJson);
      const reminders = planPayrollReminders({
        now, payDay: Number(sched.payDay) || 1, processingOffsetDays: Number(sched.processingOffsetDays) || 2,
        currentMonthRun: period?.runs[0] ?? null, hasPeople: true,
        dues: dues.map((d) => ({ kind: d.kind, amount: Number(d.amount), dueDate: d.dueDate })), reviewWaitingSince: review?.submittedAt ?? null,
      });
      for (const r of reminders) {
        await dispatchNotification({ event: 'DEADLINE_ALERT', workspaceId, data: { title: r.title, deadline: 'soon', description: r.body, actionUrl: r.actionUrl } }).catch(() => undefined);
        sent += 1;
      }
    } catch (error) {
      console.error('[payroll-reminders]', workspaceId, error);
    }
  }
  return { workspaces: workspaces.length, sent, skipped };
}
