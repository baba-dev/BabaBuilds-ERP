/**
 * GET /api/cron/alerts
 *
 * Daily cron job to dispatch deadline/renewal/payment/tax notifications.
 * Designed for a VPS with a system cron that calls this endpoint.
 *
 * crontab example (runs daily at 08:00 server time):
 *   0 8 * * * curl -s -X GET https://yourdomain.com/api/cron/alerts \
 *              -H "Authorization: Bearer $CRON_SECRET" >> /var/log/baba-cron.log 2>&1
 *
 * Authorization: reuses the existing CRON_SECRET .env variable.
 * Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT to .env as well.
 */

import { amountsOfItems } from '@/lib/retainers/pricing';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { addDays, format, startOfDay, endOfDay } from 'date-fns';

// Tax filing milestones for Indian compliance (extendable for global users)
const TAX_MILESTONES: Array<{ label: string; month: number; day: number }> = [
  // GST returns are reminded by /api/cron/gst-reminders, which knows each workspace's cadence (monthly, QRMP, composition).
  { label: 'Advance Tax Q1',            month: 6,  day: 15 },
  { label: 'Advance Tax Q2',            month: 9,  day: 15 },
  { label: 'Advance Tax Q3',            month: 12, day: 15 },
  { label: 'Advance Tax Q4',            month: 3,  day: 15 },
  { label: 'ITR Filing Deadline',       month: 7,  day: 31 },
  { label: 'Tax Audit Deadline',        month: 9,  day: 30 },
  { label: 'TDS Return Q1',             month: 7,  day: 31 },
  { label: 'TDS Return Q2',             month: 10, day: 31 },
  { label: 'TDS Return Q3',             month: 1,  day: 31 },
  { label: 'TDS Return Q4',             month: 5,  day: 31 },
];

const ALERT_WINDOW_DAYS = 7; // Notify N days before a deadline

function isSoonDeadline(targetMonth: number, targetDay: number): boolean {
  const now = new Date();
  const year = now.getFullYear();
  // Try this year, then next year
  const candidates = [
    new Date(year, targetMonth - 1, targetDay),
    new Date(year + 1, targetMonth - 1, targetDay),
  ];
  return candidates.some((d) => {
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= ALERT_WINDOW_DAYS;
  });
}

function formatDeadlineDate(targetMonth: number, targetDay: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const d = new Date(year, targetMonth - 1, targetDay);
  if (d < now) {
    const nextYear = new Date(year + 1, targetMonth - 1, targetDay);
    return format(nextYear, 'dd MMM yyyy');
  }
  return format(d, 'dd MMM yyyy');
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const results: string[] = [];
  const today = new Date();
  const inAWeek = addDays(today, ALERT_WINDOW_DAYS);

  try {
    // ── 1. Load all active workspaces ────────────────────────────────────
    const workspaces = await prisma.workspace.findMany({
      where: { subscriptionStatus: { not: 'SUSPENDED' } },
      select: { id: true },
    });

    for (const workspace of workspaces) {
      const wid = workspace.id;

      // ── 2. Payment Reminders: unpaid invoices 7+ days old ──────────────
      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          workspaceId: wid,
          status: { in: ['PENDING', 'PARTIALLY_PAID'] },
          invoiceDate: { lte: addDays(today, -7) }, // older than 7 days
        },
        select: { invoiceNumber: true, clientName: true, totalAmount: true, invoiceDate: true },
      });

      for (const inv of unpaidInvoices) {
        const daysOld = Math.floor((today.getTime() - inv.invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
        await dispatchNotification({
          event: 'PAYMENT_REMINDER',
          workspaceId: wid,
          data: {
            invoiceNumber: inv.invoiceNumber,
            clientName: inv.clientName,
            amount: `${inv.totalAmount}`,
            dueDate: format(addDays(inv.invoiceDate, 7), 'dd MMM yyyy'),
            daysOverdue: String(Math.max(0, daysOld - 7)),
          },
        });
        results.push(`[PAYMENT_REMINDER] ${inv.invoiceNumber} – ${inv.clientName}`);
      }

      // ── 3. Renewal Alerts: retainers billing within 7 days ─────────────
      const upcomingRetainers = await prisma.retainer.findMany({
        where: {
          workspaceId: wid,
          status: 'ACTIVE',
          nextBillingDate: {
            gte: startOfDay(today),
            lte: endOfDay(inAWeek),
          },
        },
        include: { client: true, items: true },
      });

      for (const r of upcomingRetainers) {
        const cycle = amountsOfItems(r.items).total;
        const label = r.name || r.items[0]?.title || 'Retainer';
        await dispatchNotification({
          event: 'RENEWAL_ALERT',
          workspaceId: wid,
          data: {
            clientName: r.client.name,
            serviceName: label,
            renewalDate: format(r.nextBillingDate, 'dd MMM yyyy'),
            amount: `${r.currency} ${cycle.toFixed(2)}`,
            frequency: r.frequency,
          },
        });
        results.push(`[RENEWAL_ALERT] ${r.client.name} – ${label}`);
      }

      // ── 4. Task Deadline Alerts: tasks due within 7 days ───────────────
      const dueTasks = await prisma.task.findMany({
        where: {
          workspaceId: wid,
          status: { not: 'DONE' },
          dueDate: {
            gte: startOfDay(today),
            lte: endOfDay(inAWeek),
          },
        },
      });

      for (const task of dueTasks) {
        if (!task.dueDate) continue;
        await dispatchNotification({
          event: 'DEADLINE_ALERT',
          workspaceId: wid,
          data: {
            title: task.title,
            deadline: format(task.dueDate, 'dd MMM yyyy'),
            description: task.description ?? '',
          },
        });
        results.push(`[DEADLINE_ALERT] ${task.title}`);
      }

      // ── 5. Tax Filing Alerts: global milestones ─────────────────────────
      for (const milestone of TAX_MILESTONES) {
        if (isSoonDeadline(milestone.month, milestone.day)) {
          await dispatchNotification({
            event: 'TAX_ALERT',
            workspaceId: wid,
            data: {
              taxType: milestone.label,
              dueDate: formatDeadlineDate(milestone.month, milestone.day),
              notes: 'Please ensure all records are reconciled before filing.',
            },
          });
          results.push(`[TAX_ALERT] ${milestone.label}`);
        }
      }
    }

    return NextResponse.json({
      message: 'Alert cron complete',
      dispatched: results.length,
      logs: results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/alerts]', err);
    return NextResponse.json({ error: 'Cron failed', detail: message }, { status: 500 });
  }
}
