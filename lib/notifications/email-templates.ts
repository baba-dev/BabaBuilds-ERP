/**
 * Notification Email Templates
 *
 * Returns branded HTML for each notification event.
 * Logo is embedded via an <img> pointing to the public URL
 * (served by the Next.js static file server / CDN).
 */

import type { NotificationEventType } from './types';
import { getLocaleDirection } from '@/lib/i18n';

// --- DESIGN TOKENS ---
const BRAND_PURPLE = '#6366f1'; // indigo-500 – matches the app accent
   // zinc-900
const BRAND_LIGHT = '#f4f4f5';  // zinc-100
const FONT_STACK = "'Inter', 'Noto Naskh Arabic', 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const escapeHtml = (value: unknown): string => {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/** Absolute public URL of the BabaBuilds logo (served from /icons/) */


// ---------------------------------------------------------------------------
// MASTER LAYOUT
// ---------------------------------------------------------------------------
export function layout(opts: {
  appUrl: string;
  companyName: string;
  emoji: string;
  headline: string;
  subheadline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accentColor?: string;
  locale?: string;
  dir?: "rtl" | "ltr";
}): string {
  const accent = opts.accentColor ?? BRAND_PURPLE;
  const locale = opts.locale ?? "en";
  const dir = opts.dir ?? getLocaleDirection(locale);
  const alignStart = dir === "rtl" ? "right" : "left";
  
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `
      <a href="${opts.ctaUrl}" target="_blank" style="display: inline-block; background-color: ${accent}; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        ${opts.ctaLabel}
      </a>
      <p style="margin: 32px 0 0 0; color: #71717a; font-size: 13px;">
        For your security, this action may require signing in to your account.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 40px 0 24px 0;" />
      <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Trouble clicking?</p>
      <p style="margin: 0; color: #71717a; font-size: 12px; word-break: break-all;">
        Copy and paste this URL into your browser:<br/>
        <a href="${opts.ctaUrl}" style="color: ${accent}; text-decoration: underline;">${opts.ctaUrl}</a>
      </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.headline}</title>
</head>
<body style="background-color: ${BRAND_LIGHT}; font-family: ${FONT_STACK}; padding: 60px 20px; margin: 0; -webkit-font-smoothing: antialiased; direction: ${dir};">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);">
    <tr>
      <td style="padding: 48px 40px; text-align: center;">
        
        <!-- Header Image or Icon -->
        <h1 style="margin: 0; color: #09090b; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">${opts.emoji} ${opts.headline}</h1>
        <p style="margin: 4px 0 0 0; color: ${accent}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">${opts.subheadline}</p>
        
        <div style="margin: 40px 0 32px 0; color: #52525b; font-size: 15px; line-height: 24px; text-align: ${alignStart};">
          ${opts.body}
        </div>
        
        ${cta}

      </td>
    </tr>
    <tr>
      <td style="background-color: #fafafa; padding: 24px 40px; text-align: center; border-top: 1px solid #e4e4e7;">
        <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 18px;">
          Sent by <strong>${opts.companyName}</strong> via BabaBuilds ERP
          <br/><br/>
          &copy; ${new Date().getFullYear()} ${opts.companyName}. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
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
  meta: { companyName: string; appUrl: string; locale?: string }
): EmailTemplate {
  const { companyName, appUrl, locale = "en" } = meta;
  const dir = getLocaleDirection(locale);

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
          appUrl, companyName, locale, dir, emoji: '🧾',
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
          appUrl, companyName, locale, dir, emoji: '✅',
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
          appUrl, companyName, locale, dir, emoji: '⏰',
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
          appUrl, companyName, locale, dir, emoji: '🤝',
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
          appUrl, companyName, locale, dir, emoji: '📄',
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
          appUrl, companyName, locale, dir, emoji: '🔧',
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
          appUrl, companyName, locale, dir, emoji: '🔄',
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
          appUrl, companyName, locale, dir, emoji: '⚠️',
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
          appUrl, companyName, locale, dir, emoji: '🏛️',
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
      const orderId = escapeHtml(data.orderId);
      const serviceName = escapeHtml(data.serviceName);
      const buyerName = escapeHtml(data.buyerName);
      const amount = escapeHtml(data.amount);
      return {
        subject: `🛒 New shop order received: ${orderId}`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '🛒',
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
      const orderId = escapeHtml(data.orderId);
      const buyerName = escapeHtml(data.buyerName);
      return {
        subject: `📝 Shop order updated: ${orderId}`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '📝',
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
      const orderId = escapeHtml(data.orderId);
      const buyerName = escapeHtml(data.buyerName);
      return {
        subject: `🗑️ Shop order deleted: ${orderId}`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '🗑️',
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
      const orderId = escapeHtml(data.orderId);
      const buyerName = escapeHtml(data.buyerName);
      const oldStatus = escapeHtml(data.oldStatus);
      const newStatus = escapeHtml(data.newStatus);
      return {
        subject: `📦 Shop order status changed: ${orderId} (${newStatus})`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '📦',
          headline: 'Shop Order Status Changed',
          subheadline: `Order ${orderId} moved to ${newStatus}`,
          body: `<p><strong>${buyerName}</strong>'s order changed from <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.</p>`,
          ctaLabel: 'Track Shop Orders',
          ctaUrl: `${appUrl}/shop`,
        }),
        text: `Shop order ${orderId} for ${buyerName} changed from ${oldStatus} to ${newStatus}.`,
      };
    }

    case 'RETAINER_CREATED': {
      const client = escapeHtml(data.clientName);
      const service = escapeHtml(data.serviceName);
      const amount = escapeHtml(data.amount);
      return {
        subject: `📋 New retainer created for ${client}`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '📋',
          headline: 'Retainer Established',
          subheadline: `New recurring service for ${client}`,
          body: `<p>A new retainer for <strong>${service}</strong> has been successfully created for <strong>${client}</strong> at <strong>${amount}</strong>.</p>`,
          ctaLabel: 'View Retainers',
          ctaUrl: `${appUrl}/retainers`,
        }),
        text: `New retainer created for ${client} (${service} - ${amount}).`,
      };
    }

    case 'BILLING_FAILED': {
      const client = escapeHtml(data.clientName);
      const message = escapeHtml(data.message);
      return {
        subject: `⚠️ Automated billing failed for ${client}`,
        html: layout({
          appUrl, companyName, emoji: '⚠️',
          headline: 'Billing Failed',
          subheadline: `Automated billing issue for ${client}`,
          accentColor: '#ef4444',
          body: `<p>Automated billing could not be completed for <strong>${client}</strong>.</p>
                 <p>${message}</p>`,
          ctaLabel: 'Review Retainers',
          ctaUrl: `${appUrl}/retainers`,
        }),
        text: `Automated billing failed for ${client}. ${message}`,
      };
    }

    case 'PROPOSAL_VIEWED': {
      const proposal = escapeHtml(data.proposalNo);
      const client = escapeHtml(data.clientName);
      return {
        subject: `👀 Proposal ${proposal} was viewed`,
        html: layout({
          appUrl, companyName, emoji: '👀',
          headline: 'Proposal Viewed',
          subheadline: `${client} viewed your proposal`,
          body: `<p><strong>${client}</strong> has viewed proposal <strong>${proposal}</strong>.</p>
                 <p>Consider following up while engagement is fresh.</p>`,
          ctaLabel: 'Open Proposals',
          ctaUrl: `${appUrl}/proposals`,
        }),
        text: `${client} viewed proposal ${proposal}.`,
      };
    }

    case 'PROPOSAL_ACCEPTED': {
      const proposal = escapeHtml(data.proposalNo);
      const client = escapeHtml(data.clientName);
      return {
        subject: `🎉 Proposal ${proposal} accepted by ${client}!`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '🎉',
          headline: 'Proposal Accepted',
          subheadline: `Great news! ${client} accepted your proposal`,
          accentColor: '#22c55e',
          body: `<p><strong>${client}</strong> has digitally signed and accepted proposal <strong>${proposal}</strong>.</p>
                 <p>You can now convert it to an invoice and begin work.</p>`,
          ctaLabel: 'View Proposal',
          ctaUrl: `${appUrl}/proposals`,
        }),
        text: `Proposal ${proposal} was accepted by ${client}.`,
      };
    }

    case 'SETTINGS_UPDATED': {
      const section = escapeHtml(data.section);
      const updatedBy = escapeHtml(data.updatedBy);
      return {
        subject: `⚙️ Workspace settings updated: ${section}`,
        html: layout({
          appUrl, companyName, locale, dir, emoji: '⚙️',
          headline: 'Settings Updated',
          subheadline: `${section} settings modified`,
          body: `<p>Important workspace settings in the <strong>${section}</strong> section were updated by <strong>${updatedBy}</strong>.</p>
                 <p>If you did not authorize this, please review your workspace audit logs immediately.</p>`,
          ctaLabel: 'Review Settings',
          ctaUrl: `${appUrl}/settings`,
        }),
        text: `Workspace settings (${section}) were updated by ${updatedBy}.`,
      };
    }

    case 'LEAVE_REQUEST_SUBMITTED': {
      const employeeName = escapeHtml(data.employeeName);
      const leaveType = escapeHtml(data.leaveType);
      const days = escapeHtml(data.days);
      return {
        subject: `🗓️ New leave request from ${employeeName}`,
        html: layout({
          appUrl, companyName, emoji: '🗓️',
          headline: 'Leave Request Submitted',
          subheadline: `${employeeName} requested ${leaveType}`,
          body: `<p><strong>${employeeName}</strong> has submitted a leave request for <strong>${days}</strong> day(s) of <strong>${leaveType}</strong>.</p>`,
          ctaLabel: 'Review Leave Queue',
          ctaUrl: `${appUrl}/workforce/leave`,
        }),
        text: `${employeeName} submitted a leave request for ${days} day(s) of ${leaveType}.`,
      };
    }

    case 'LEAVE_APPROVED': {
      const leaveType = escapeHtml(data.leaveType);
      return {
        subject: `✅ Your ${leaveType} leave was approved`,
        html: layout({
          appUrl, companyName, emoji: '✅',
          headline: 'Leave Request Approved',
          subheadline: `${leaveType} leave approved`,
          accentColor: '#22c55e',
          body: `<p>Your leave request for <strong>${leaveType}</strong> has been approved.</p>`,
          ctaLabel: 'View Leave Status',
          ctaUrl: `${appUrl}/workforce/leave`,
        }),
        text: `Your ${leaveType} leave request has been approved.`,
      };
    }

    case 'LEAVE_REJECTED': {
      const leaveType = escapeHtml(data.leaveType);
      return {
        subject: `❌ Your ${leaveType} leave was rejected`,
        html: layout({
          appUrl, companyName, emoji: '❌',
          headline: 'Leave Request Rejected',
          subheadline: `${leaveType} leave rejected`,
          accentColor: '#ef4444',
          body: `<p>Your leave request for <strong>${leaveType}</strong> has been rejected.</p>`,
          ctaLabel: 'View Leave Status',
          ctaUrl: `${appUrl}/workforce/leave`,
        }),
        text: `Your ${leaveType} leave request has been rejected.`,
      };
    }

    default:
      return {
        subject: 'Notification from BabaBuilds ERP',
        html: layout({
          appUrl, companyName, locale, dir, emoji: '🔔',
          headline: 'New Notification',
          subheadline: 'You have a new activity update',
          body: `<p>You have a new notification in your workspace.</p>
                 <p>Please open BabaBuilds ERP to view the details.</p>`,
          ctaLabel: 'Open Dashboard',
          ctaUrl: `${appUrl}/dashboard`,
        }),
        text: 'You have a new notification from BabaBuilds ERP.',
      };
  }
}
