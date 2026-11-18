import 'server-only';
import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { hasPermission, isValidBusinessRole, legacyRoleToBusinessRole } from '@/lib/permissions';
import { buildPaymentDigest, getBillingCalendar, type PaymentDigest } from './calendar';
import { listBalances } from './collections';
import type { EffectiveMailBillingSettings } from './settings';
import { utcDay } from './usage-math';

/** People who may see what customers owe: everyone whose role carries the Email Hosting billing permission. */
async function digestRecipients(workspaceId: string): Promise<string[]> {
  const members = await prisma.workspaceUser.findMany({ where: { workspaceId, isActive: true }, select: { userId: true, role: true, businessRole: true } });
  return members
    .filter((m) => hasPermission(isValidBusinessRole(m.businessRole) ? m.businessRole : legacyRoleToBusinessRole(m.role), 'email_hosting.billing'))
    .map((m) => m.userId);
}

const BALANCE_LINES = 12;
const money = (amount: number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);

/** Accrual billing: who has the most built up and which collection invoices are still unpaid. Null when nobody owes anything. */
export function buildBalanceDigest(balances: Awaited<ReturnType<typeof listBalances>>): PaymentDigest | null {
  const owing = balances.rows.filter((r) => r.owed > 0 || r.openInvoices > 0);
  if (owing.length === 0) return null;
  const lines = owing.map((r) => {
    const parts = [r.clientName];
    if (r.owed > 0) parts.push(`${money(r.owed, r.currency)} built up (${r.addresses} address${r.addresses === 1 ? '' : 'es'}, since ${r.oldestUnchargedDay})`);
    if (r.openInvoices > 0) parts.push(`${r.openInvoices} unpaid collection invoice${r.openInvoices === 1 ? '' : 's'} (${money(r.openInvoiceAmount, r.currency)})`);
    return parts.join(' · ');
  });
  const shown = lines.slice(0, BALANCE_LINES);
  if (lines.length > shown.length) shown.push(`…and ${lines.length - shown.length} more`);
  const owedClients = owing.filter((r) => r.owed > 0).length;
  const total = balances.totals.filter((t) => t.owed > 0).map((t) => money(t.owed, t.currency)).join(' + ');
  const body = [owedClients ? `${total} to collect from ${owedClients} client${owedClients === 1 ? '' : 's'}` : '', owing.some((r) => r.openInvoices > 0) ? 'unpaid collection invoices' : ''].filter(Boolean).join(' · ');
  return { title: `Email hosting: ${body}`, body, lines: shown };
}

/**
 * Tells the owner what is due: billing dates and unpaid invoices from the next 7 days, plus anything overdue. Sent at most
 * once per day (Mondays only on the weekly setting), and only when there is something to collect.
 */
export async function sendPaymentDigest(workspaceId: string, settings: Pick<EffectiveMailBillingSettings, 'paymentDigest'> & Partial<Pick<EffectiveMailBillingSettings, 'billingModel'>>, now: Date): Promise<'SENT' | 'SKIPPED'> {
  if (settings.paymentDigest === 'OFF') return 'SKIPPED';
  if (settings.paymentDigest === 'WEEKLY' && now.getUTCDay() !== 1) return 'SKIPPED';
  const today = utcDay(now);

  const digest = settings.billingModel === 'ACCRUAL' ? buildBalanceDigest(await listBalances(workspaceId, now)) : buildPaymentDigest(await getBillingCalendar(workspaceId, now, 7));
  if (!digest) return 'SKIPPED';
  const userIds = await digestRecipients(workspaceId);
  if (userIds.length === 0) return 'SKIPPED';

  // Settings are created lazily, so make sure the row exists, then claim today's send so overlapping runs cannot both notify.
  await prisma.mailBillingSettings.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
  const claimed = await prisma.mailBillingSettings.updateMany({
    where: { workspaceId, OR: [{ lastDigestOn: null }, { lastDigestOn: { lt: today } }] },
    data: { lastDigestOn: today },
  });
  if (claimed.count === 0) return 'SKIPPED';
  await dispatchNotification({ event: 'EMAIL_HOSTING_DIGEST', workspaceId, userIds, data: { title: digest.title, body: digest.body, lines: digest.lines } });
  return 'SENT';
}
