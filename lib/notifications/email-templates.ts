/**
 * Notification Email Templates
 *
 * Returns branded HTML for each notification event.
 * Logo is embedded via an <img> pointing to the public URL
 * (served by the Next.js static file server / CDN).
 */

import type { NotificationEventType } from './types';

// --- DESIGN TOKENS ---
const BRAND_PURPLE = '#6366f1'; // indigo-500 – matches the app accent
const BRAND_DARK = '#18181b';   // zinc-900
const BRAND_LIGHT = '#f4f4f5';  // zinc-100
const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Absolute public URL of the BabaBuilds logo (served from /icons/) */
function logoTag(appUrl: string): string {
  return `<img src="${appUrl}/icons/BabaBuillds_ERP_Logo.png" alt="BabaBuilds ERP" width="140" style="display:block;max-width:140px;height:auto;" />`;
}

// ---------------------------------------------------------------------------
// MASTER LAYOUT
// ---------------------------------------------------------------------------
function layout(opts: {
  appUrl: string;
  companyName: string;
  emoji: string;
  headline: string;
  subheadline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accentColor?: string;
}): string {
  const accent = opts.accentColor ?? BRAND_PURPLE;
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `
      <div style="text-align:center;margin:32px 0;">
        <a href="${opts.ctaUrl}"
           style="display:inline-block;padding:14px 32px;background:${accent};color:#fff;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">
          ${opts.ctaLabel}
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.headline}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_LIGHT};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:${BRAND_DARK};padding:28px 40px;display:flex;align-items:center;justify-content:space-between;">
      ${logoTag(opts.appUrl)}
      <span style="font-size:30px;line-height:1;">${opts.emoji}</span>
    </div>

    <!-- Accent bar -->
    <div style="height:4px;background:linear-gradient(90deg,${accent},#a5b4fc);"></div>

    <!-- Body -->
    <div style="padding:40px 40px 32px;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND_DARK};">${opts.headline}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#71717a;">${opts.subheadline}</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 24px;" />
      <div style="font-size:15px;line-height:1.7;color:#3f3f46;">${opts.body}</div>
      ${cta}
    </div>

    <!-- Footer -->
    <div style="background:${BRAND_LIGHT};padding:20px 40px;border-top:1px solid #e4e4e7;text-align:center;">
      <p style="margin:0;font-size:12px;color:#a1a1aa;">
        Sent by <strong>${opts.companyName}</strong> via BabaBuilds ERP &middot;
        <a href="${opts.appUrl}/settings/notifications" style="color:${accent};text-decoration:none;">Manage Notifications</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// EVENT TEMPLATES
// ---------------------------------------------------------------------------

export type EmailTemplate = { subject: string; html: string; text: string };

export function buildEmailTemplate(
  event: NotificationEventType,
  data: Record<string, unknown>,
  meta: { companyName: string; appUrl: string }
): EmailTemplate {
  const { companyName, appUrl } = meta;

  switch (event) {
    // ── Invoice Generated ───────────────────────────────────────────────────
    case 'INVOICE_GENERATED': {
      const inv = data.invoiceNumber as string;
      const client = data.clientName as string;
      const amount = data.amount as string;
      const pdfUrl = data.pdfUrl ? `${appUrl}${data.pdfUrl}` : `${appUrl}/invoice`;
      return {
        subject: `🧾 Invoice ${inv} generated for ${client}`,
        html: layout({
          appUrl, companyName, emoji: '🧾',
          headline: `Invoice ${inv} Ready`,
          subheadline: `A new invoice has been generated for ${client}`,
          body: `
            <p>Hi there,</p>
            <p>Invoice <strong>${inv}</strong> for <strong>${client}</strong> amounting to <strong>${amount}</strong> has been successfully generated.</p>
            <p>You can view the PDF or share the payment link directly with your client.</p>`,
          ctaLabel: 'View Invoice',
          ctaUrl: pdfUrl,
        }),
        text: `Invoice ${inv} for ${client} (${amount}) has been generated. View: ${pdfUrl}`,
      };
    }

    // ── Invoice Paid ────────────────────────────────────────────────────────
    case 'INVOICE_PAID': {
      const inv = data.invoiceNumber as string;
      const client = data.clientName as string;
      const amount = data.amount as string;
      return {
        subject: `✅ Payment received — Invoice ${inv}`,
        html: layout({
          appUrl, companyName, emoji: '✅',
          headline: 'Payment Received!',
          subheadline: `Invoice ${inv} from ${client} is now settled`,
          accentColor: '#22c55e',
          body: `
            <p>Great news! Payment of <strong>${amount}</strong> has been received for Invoice <strong>${inv}</strong> from <strong>${client}</strong>.</p>`,
          ctaLabel: 'Go to Invoices',
          ctaUrl: `${appUrl}/invoice`,
        }),
        text: `Payment of ${amount} received for Invoice ${inv} from ${client}.`,
      };
    }

    // ── Payment Reminder ────────────────────────────────────────────────────
    case 'PAYMENT_REMINDER': {
      const inv = data.invoiceNumber as string;
      const client = data.clientName as string;
      const amount = data.amount as string;
      const dueDate = data.dueDate as string;
      return {
        subject: `⏰ Payment reminder — Invoice ${inv} due ${dueDate}`,
        html: layout({
          appUrl, companyName, emoji: '⏰',
          headline: 'Payment Reminder',
          subheadline: `Invoice ${inv} for ${client} is awaiting payment`,
          accentColor: '#f59e0b',
          body: `
            <p>This is a friendly reminder that Invoice <strong>${inv}</strong> for <strong>${amount}</strong> sent to <strong>${client}</strong> is due on <strong>${dueDate}</strong>.</p>
            <p>If payment has already been made, please disregard this message.</p>`,
          ctaLabel: 'View Invoice',
          ctaUrl: `${appUrl}/invoice`,
        }),
        text: `Reminder: Invoice ${inv} for ${client} (${amount}) is due on ${dueDate}.`,
      };
    }

    // ── Client Added ────────────────────────────────────────────────────────
    case 'CLIENT_ADDED': {
      const client = data.clientName as string;
      return {
        subject: `🤝 New client added: ${client}`,
        html: layout({
          appUrl, companyName, emoji: '🤝',
          headline: `Welcome, ${client}!`,
          subheadline: 'A new client has been added to your workspace',
          body: `
            <p><strong>${client}</strong> has been successfully added as a client on BabaBuilds ERP.</p>
            <p>You can now create invoices, proposals, and retainers for this client.</p>`,
          ctaLabel: 'View Clients',
          ctaUrl: `${appUrl}/clients`,
        }),
        text: `New client ${client} has been added.`,
      };
    }

    // ── Proposal / Quote Created ────────────────────────────────────────────
    case 'PROPOSAL_CREATED': {
      const proposal = data.proposalNo as string;
      const client = data.clientName as string;
      const amount = data.amount as string;
      return {
        subject: `📄 Proposal ${proposal} created for ${client}`,
        html: layout({
          appUrl, companyName, emoji: '📄',
          headline: `Proposal ${proposal} Created`,
          subheadline: `Quote sent to ${client}`,
          body: `
            <p>A new proposal <strong>${proposal}</strong> worth <strong>${amount}</strong> has been created for <strong>${client}</strong>.</p>
            <p>The client can view and e-sign the proposal via the secure public link.</p>`,
          ctaLabel: 'View Proposals',
          ctaUrl: `${appUrl}/proposals`,
        }),
        text: `Proposal ${proposal} for ${client} (${amount}) has been created.`,
      };
    }

    // ── Service / Template Created ──────────────────────────────────────────
    case 'SERVICE_CREATED': {
      const service = data.serviceName as string;
      return {
        subject: `🔧 New service template created: ${service}`,
        html: layout({
          appUrl, companyName, emoji: '🔧',
          headline: 'New Service Added',
          subheadline: `${service} is ready to use in proposals and invoices`,
          body: `
            <p>Service template <strong>${service}</strong> has been created and is now available in your catalog.</p>`,
          ctaLabel: 'View Services',
          ctaUrl: `${appUrl}/services`,
        }),
        text: `New service template "${service}" has been created.`,
      };
    }

    // ── Renewal Alert ───────────────────────────────────────────────────────
    case 'RENEWAL_ALERT': {
      const client = data.clientName as string;
      const service = data.serviceName as string;
      const renewalDate = data.renewalDate as string;
      const amount = data.amount as string;
      return {
        subject: `🔄 Retainer renewal upcoming — ${client} on ${renewalDate}`,
        html: layout({
          appUrl, companyName, emoji: '🔄',
          headline: 'Retainer Renewal Alert',
          subheadline: `Upcoming renewal for ${client}`,
          accentColor: '#8b5cf6',
          body: `
            <p>The retainer for <strong>${client}</strong> — <em>${service}</em> — is scheduled to renew on <strong>${renewalDate}</strong> for <strong>${amount}</strong>.</p>
            <p>Ensure payment details and service terms are up to date.</p>`,
          ctaLabel: 'Manage Retainers',
          ctaUrl: `${appUrl}/retainers`,
        }),
        text: `Retainer for ${client} (${service}, ${amount}) renews on ${renewalDate}.`,
      };
    }

    // ── Deadline Alert ──────────────────────────────────────────────────────
    case 'DEADLINE_ALERT': {
      const title = data.title as string;
      const deadline = data.deadline as string;
      const description = data.description as string | undefined;
      return {
        subject: `⚠️ Deadline approaching: ${title}`,
        html: layout({
          appUrl, companyName, emoji: '⚠️',
          headline: 'Deadline Alert',
          subheadline: title,
          accentColor: '#ef4444',
          body: `
            <p>A deadline is approaching: <strong>${title}</strong> on <strong>${deadline}</strong>.</p>
            ${description ? `<p>${description}</p>` : ''}`,
          ctaLabel: 'Go to Dashboard',
          ctaUrl: `${appUrl}/dashboard`,
        }),
        text: `Deadline: ${title} on ${deadline}.`,
      };
    }

    // ── Tax Filing Alert ────────────────────────────────────────────────────
    case 'TAX_ALERT': {
      const taxType = data.taxType as string;
      const dueDate = data.dueDate as string;
      const notes = data.notes as string | undefined;
      return {
        subject: `🏛️ Tax filing reminder: ${taxType} due ${dueDate}`,
        html: layout({
          appUrl, companyName, emoji: '🏛️',
          headline: 'Tax Filing Reminder',
          subheadline: `${taxType} return due by ${dueDate}`,
          accentColor: '#0ea5e9',
          body: `
            <p>This is a reminder that your <strong>${taxType}</strong> return is due by <strong>${dueDate}</strong>.</p>
            ${notes ? `<p>${notes}</p>` : ''}
            <p>Please ensure all invoices, expenses, and reconciliation are complete before filing.</p>`,
          ctaLabel: 'Go to Tax Dashboard',
          ctaUrl: `${appUrl}/tax`,
        }),
        text: `Tax Filing Reminder: ${taxType} due by ${dueDate}.`,
      };
    }
    case 'SHOP_ORDER_CREATED': {
      const orderId = data.orderId as string;
      const serviceName = data.serviceName as string;
      const buyerName = data.buyerName as string;
      const amount = data.amount as string;
      return {
        subject: `🛒 New shop order received: ${orderId}`,
        html: layout({
          appUrl, companyName, emoji: '🛒',
          headline: 'New Shop Order',
          subheadline: `${buyerName} placed an order for ${serviceName}`,
          body: `<p>Order <strong>${orderId}</strong> has been created for <strong>${amount}</strong>.</p>`,
          ctaLabel: 'Review Shop Orders',
          ctaUrl: `${appUrl}/shop`,
        }),
        text: `New shop order ${orderId} by ${buyerName} for ${serviceName} (${amount}).`,
      };
    }

    case 'SHOP_ORDER_UPDATED': {
      const orderId = data.orderId as string;
      const buyerName = data.buyerName as string;
      return {
        subject: `📝 Shop order updated: ${orderId}`,
        html: layout({
          appUrl, companyName, emoji: '📝',
          headline: 'Shop Order Updated',
          subheadline: `Order ${orderId} was updated`,
          body: `<p>The shop order for <strong>${buyerName}</strong> has new details.</p>`,
          ctaLabel: 'View Shop Orders',
          ctaUrl: `${appUrl}/shop`,
        }),
        text: `Shop order ${orderId} for ${buyerName} was updated.`,
      };
    }

    case 'SHOP_ORDER_DELETED': {
      const orderId = data.orderId as string;
      const buyerName = data.buyerName as string;
      return {
        subject: `🗑️ Shop order deleted: ${orderId}`,
        html: layout({
          appUrl, companyName, emoji: '🗑️',
          headline: 'Shop Order Deleted',
          subheadline: `Order ${orderId} was removed`,
          accentColor: '#ef4444',
          body: `<p>The shop order for <strong>${buyerName}</strong> was deleted.</p>`,
          ctaLabel: 'Open Shop Orders',
          ctaUrl: `${appUrl}/shop`,
        }),
        text: `Shop order ${orderId} for ${buyerName} was deleted.`,
      };
    }

    case 'SHOP_ORDER_STATUS_CHANGED': {
      const orderId = data.orderId as string;
      const buyerName = data.buyerName as string;
      const oldStatus = data.oldStatus as string;
      const newStatus = data.newStatus as string;
      return {
        subject: `📦 Shop order status changed: ${orderId} (${newStatus})`,
        html: layout({
          appUrl, companyName, emoji: '📦',
          headline: 'Shop Order Status Changed',
          subheadline: `Order ${orderId} moved to ${newStatus}`,
          body: `<p><strong>${buyerName}</strong>'s order changed from <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.</p>`,
          ctaLabel: 'Track Shop Orders',
          ctaUrl: `${appUrl}/shop`,
        }),
        text: `Shop order ${orderId} for ${buyerName} changed from ${oldStatus} to ${newStatus}.`,
      };
    }

    default:
      return {
        subject: 'BabaBuilds ERP — Notification',
        html: layout({
          appUrl, companyName, emoji: '🔔',
          headline: 'New Notification',
          subheadline: '',
          body: `<p>${JSON.stringify(data)}</p>`,
        }),
        text: 'You have a new notification from BabaBuilds ERP.',
      };
  }
}
