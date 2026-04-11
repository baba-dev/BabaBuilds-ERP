/**
 * Notification Dispatcher — Central Router
 *
 * Call `dispatchNotification()` from any API route or cron job.
 * It fans out to all three channels (Email, Push, In-App) simultaneously,
 * respecting per-user channel preferences.
 *
 * Usage:
 *   await dispatchNotification({
 *     event: 'INVOICE_GENERATED',
 *     workspaceId: '...',
 *     data: { invoiceNumber: 'INV/25-26/001', clientName: 'Acme', amount: '₹50,000' },
 *   });
 */

import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { buildEmailTemplate } from './email-templates';
import { broadcastPush } from './web-push';
import type { NotificationPayload, PushPayload } from './types';

/** Returns a human-readable title + body for in-app / push from the event type */
function buildPushAndInAppContent(
  event: NotificationPayload['event'],
  data: Record<string, unknown>,
): { title: string; body: string; actionUrl: string } {
  const d = data as Record<string, string>;

  switch (event) {
    case 'INVOICE_GENERATED':
      return {
        title: `Invoice ${d.invoiceNumber} Generated`,
        body: `New invoice for ${d.clientName} — ${d.amount}`,
        actionUrl: '/invoice',
      };
    case 'INVOICE_PAID':
      return {
        title: 'Payment Received 💰',
        body: `Invoice ${d.invoiceNumber} from ${d.clientName} is settled`,
        actionUrl: '/invoice',
      };
    case 'PAYMENT_REMINDER':
      return {
        title: `⏰ Payment Due — ${d.invoiceNumber}`,
        body: `${d.clientName} owes ${d.amount} (due ${d.dueDate})`,
        actionUrl: '/invoice',
      };
    case 'CLIENT_ADDED':
      return {
        title: `New Client: ${d.clientName}`,
        body: 'A new client has been added to your workspace.',
        actionUrl: '/clients',
      };
    case 'PROPOSAL_CREATED':
      return {
        title: `Proposal ${d.proposalNo} Created`,
        body: `Quote for ${d.clientName} — ${d.amount}`,
        actionUrl: '/proposals',
      };
    case 'SERVICE_CREATED':
      return {
        title: `New Service: ${d.serviceName}`,
        body: 'New service template added to your catalog.',
        actionUrl: '/services',
      };
    case 'RENEWAL_ALERT':
      return {
        title: `🔄 Renewal Alert — ${d.clientName}`,
        body: `${d.serviceName} renews on ${d.renewalDate} (${d.amount})`,
        actionUrl: '/retainers',
      };
    case 'DEADLINE_ALERT':
      return {
        title: `⚠️ Deadline: ${d.title}`,
        body: `Due on ${d.deadline}`,
        actionUrl: '/dashboard',
      };
    case 'TAX_ALERT':
      return {
        title: `🏛️ Tax Filing: ${d.taxType}`,
        body: `Return due by ${d.dueDate}`,
        actionUrl: '/tax',
      };
    case 'SHOP_ORDER_CREATED':
      return {
        title: `🛒 New Shop Order: ${d.orderId}`,
        body: `${d.buyerName} placed an order for ${d.serviceName} (${d.amount})`,
        actionUrl: '/shop',
      };
    case 'SHOP_ORDER_UPDATED':
      return {
        title: `📝 Shop Order Updated: ${d.orderId}`,
        body: `Order for ${d.buyerName} was updated`,
        actionUrl: '/shop',
      };
    case 'SHOP_ORDER_DELETED':
      return {
        title: `🗑️ Shop Order Deleted: ${d.orderId}`,
        body: `Order for ${d.buyerName} was removed`,
        actionUrl: '/shop',
      };
    case 'SHOP_ORDER_STATUS_CHANGED':
      return {
        title: `📦 Shop Order Status: ${d.orderId}`,
        body: `${d.buyerName} order changed from ${d.oldStatus} to ${d.newStatus}`,
        actionUrl: '/shop',
      };
    default:
      return { title: 'BabaBuilds ERP', body: 'You have a new notification', actionUrl: '/dashboard' };
  }
}

export async function dispatchNotification(payload: NotificationPayload): Promise<void> {
  try {
    const { event, workspaceId, data, userIds } = payload;
    const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // ── 1. Resolve Target Users ───────────────────────────────────────────
    // If userIds are provided explicitly, use them; otherwise target all workspace owners/members
    const workspaceUsers = await prisma.workspaceUser.findMany({
      where: {
        workspaceId,
        ...(userIds && userIds.length > 0 ? { userId: { in: userIds } } : {}),
      },
      include: { user: true },
    });

    if (workspaceUsers.length === 0) return;

    // ── 2. Load Business Profile for Email (SMTP config + branding) ───────
    const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
    const companyName = profile?.companyName ?? 'BabaBuilds ERP';

    // ── 3. Build shared content once ─────────────────────────────────────
    const { subject, html: emailHtml, text: emailText } = buildEmailTemplate(
      event,
      data,
      { companyName, appUrl: APP_URL },
    );

    const { title: pushTitle, body: pushBody, actionUrl } = buildPushAndInAppContent(event, data);

    // ── 4. Fan out per user ───────────────────────────────────────────────
    await Promise.allSettled(
      workspaceUsers.map(async ({ user }) => {
        try {
          // ── 4a. IN-APP NOTIFICATION (always, if notifyInApp is true) ─────
          if (user.notifyInApp) {
            await prisma.inAppNotification.create({
              data: {
                userId: user.id,
                workspaceId,
                eventType: event,
                title: pushTitle,
                body: pushBody,
                actionUrl,
              },
            });
          }

          // ── 4b. EMAIL ────────────────────────────────────────────────────
          if (user.notifyEmail && user.transactionalAlerts && profile?.smtpHost && user.email) {
            await sendEmail({
              profile,
              to: user.email,
              subject,
              html: emailHtml,
              text: emailText,
            }).catch((err) => console.error('[notify] email failed:', err));
          }

          // ── 4c. PUSH ─────────────────────────────────────────────────────
          if (user.notifyPush) {
            const subs = await prisma.pushSubscription.findMany({
              where: { userId: user.id },
            });

            if (subs.length > 0) {
              const pushPayload: PushPayload = {
                title: pushTitle,
                body: pushBody,
                url: actionUrl,
                tag: event.toLowerCase(),
              };

              const staleEndpoints = await broadcastPush(subs, pushPayload);

              // Remove stale subscriptions
              if (staleEndpoints.length > 0) {
                await prisma.pushSubscription.deleteMany({
                  where: { endpoint: { in: staleEndpoints } },
                }).catch(() => null);
              }
            }
          }
        } catch (userErr) {
          console.error(`[notify] Failed for user ${user.id}:`, userErr);
        }
      }),
    );
  } catch (err) {
    // Never throw — notifications are fire-and-forget
    console.error('[notify] dispatchNotification error:', err);
  }
}
