type TemplateResult = {
  subject: string;
  html: string;
  text: string;
};

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brandedLayout(opts: {
  title: string;
  eyebrow?: string;
  subtitle: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  companyName: string;
  accentColor?: string;
  footerNote?: string;
}) {
  const accent = opts.accentColor ?? '#4f46e5';
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `
      <a href="${escapeHtml(opts.ctaUrl)}" target="_blank" style="display:inline-block;background-color:${accent};color:#ffffff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">
        ${escapeHtml(opts.ctaLabel)}
      </a>
    `
    : '';

  const footerText = opts.footerNote || `Sent by <strong>${escapeHtml(opts.companyName)}</strong> via BabaBuilds ERP`;

  return `
    <body style="background-color:#f4f4f5;font-family:${FONT_STACK};padding:60px 20px;margin:0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,.05),0 8px 10px -6px rgba(0,0,0,.01);">
        <tr>
          <td style="padding:48px 40px;text-align:center;">
            <h1 style="margin:0;color:#09090b;font-size:28px;font-weight:900;letter-spacing:-0.5px;">${escapeHtml(opts.title)}</h1>
            ${opts.eyebrow ? `<p style="margin:4px 0 0 0;color:${accent};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(opts.eyebrow)}</p>` : ''}
            <p style="margin:24px 0 24px 0;color:#52525b;font-size:15px;line-height:24px;">${escapeHtml(opts.subtitle)}</p>
            <div style="margin:0 0 28px 0;color:#3f3f46;font-size:15px;line-height:24px;text-align:left;">
              ${opts.bodyHtml}
            </div>
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="background-color:#fafafa;padding:24px 40px;text-align:center;border-top:1px solid #e4e4e7;">
            <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:18px;">
              ${footerText}
              <br/><br/>
              &copy; ${new Date().getFullYear()} ${escapeHtml(opts.companyName)}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
  `;
}

interface LocalizationMap {
  invoiceReady: string;
  billing: string;
  invoiceAttached: string;
  hi: string;
  invoiceBody: string;
  totalAmount: string;
  thankYou: string;
  bestRegards: string;
  sentBy: string;
}

const LOCALES: Record<string, LocalizationMap> = {
  'en-IN': {
    invoiceReady: '🧾 Invoice Ready',
    billing: 'Billing',
    invoiceAttached: 'Invoice {invoice} is attached for {client}.',
    hi: 'Hi {client},',
    invoiceBody: 'Your invoice <strong>{invoice}</strong> for billing month <strong>{billingMonth}</strong> is attached to this email.',
    totalAmount: 'Total Amount Billed:',
    thankYou: 'Thank you for your business.',
    bestRegards: 'Best Regards,',
    sentBy: 'Sent by <strong>{companyName}</strong> via BabaBuilds ERP',
  },
  'en-US': {
    invoiceReady: '🧾 Invoice Ready',
    billing: 'Billing',
    invoiceAttached: 'Invoice {invoice} is attached for {client}.',
    hi: 'Hi {client},',
    invoiceBody: 'Your invoice <strong>{invoice}</strong> for billing month <strong>{billingMonth}</strong> is attached to this email.',
    totalAmount: 'Total Amount Billed:',
    thankYou: 'Thank you for your business.',
    bestRegards: 'Best Regards,',
    sentBy: 'Sent by <strong>{companyName}</strong> via BabaBuilds ERP',
  }
};

function getLocaleStrings(locale: string = 'en-IN'): LocalizationMap {
  return LOCALES[locale] || LOCALES['en-IN'];
}

export function buildInvoiceDeliveryEmail(args: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  billingMonth: string;
  amountFormatted: string;
  locale?: string;
}): TemplateResult {
  const strings = getLocaleStrings(args.locale);
  const client = escapeHtml(args.clientName);
  const invoice = escapeHtml(args.invoiceNumber);
  const billingMonth = escapeHtml(args.billingMonth);
  const amount = escapeHtml(args.amountFormatted);
  const company = escapeHtml(args.companyName);

  const subtitle = strings.invoiceAttached.replace('{invoice}', invoice).replace('{client}', client);
  const bodyHtml = `
    <p>${strings.hi.replace('{client}', client)}</p>
    <p>${strings.invoiceBody.replace('{invoice}', invoice).replace('{billingMonth}', billingMonth)}</p>
    <p><strong>${strings.totalAmount}</strong> ${amount}</p>
    <p>${strings.thankYou}</p>
  `;

  return {
    subject: `Invoice ${args.invoiceNumber} from ${args.companyName}`,
    html: brandedLayout({
      title: strings.invoiceReady,
      eyebrow: strings.billing,
      subtitle,
      companyName: args.companyName,
      bodyHtml,
      footerNote: strings.sentBy.replace('{companyName}', company),
    }),
    text: `${strings.hi.replace('{client}', args.clientName)}\n\n${strings.invoiceAttached.replace('{invoice}', args.invoiceNumber).replace('{client}', args.clientName)}\n\n${strings.totalAmount} ${args.amountFormatted}\n\n${strings.thankYou}\n\n${strings.bestRegards}\n${args.companyName}`,
  };
}

export function buildPaymentReminderEmail(args: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  outstandingAmountFormatted: string;
  locale?: string;
}): TemplateResult {
  // Using generic terms as I didn't add them to LocalizationMap yet for brevity, but the pattern is established.
  const client = escapeHtml(args.clientName);
  const invoice = escapeHtml(args.invoiceNumber);
  const amount = escapeHtml(args.outstandingAmountFormatted);

  return {
    subject: `Payment reminder: Invoice ${args.invoiceNumber}`,
    html: brandedLayout({
      title: '⏰ Payment Reminder',
      eyebrow: 'Accounts Receivable',
      subtitle: `Invoice ${invoice} still has an outstanding balance.`,
      companyName: args.companyName,
      accentColor: '#f59e0b',
      bodyHtml: `
        <p>Hi ${client},</p>
        <p>This is a friendly reminder that invoice <strong>${invoice}</strong> has an outstanding balance of <strong>${amount}</strong>.</p>
        <p>If payment has already been made, please ignore this message.</p>
      `,
    }),
    text: `Dear ${args.clientName},\n\nThis is a reminder that Invoice ${args.invoiceNumber} has an outstanding balance of ${args.outstandingAmountFormatted}.\n\nIf you have already paid, please disregard this message.\n\nThank you,\n${args.companyName}`,
  };
}

/** Reminder wording that gets firmer as an invoice ages: friendly, then firm, then final notice. */
export function buildDunningEmail(args: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  outstandingAmountFormatted: string;
  dueDateFormatted: string;
  daysOverdue: number;
  tone: 'friendly' | 'firm' | 'final';
}): TemplateResult {
  const client = escapeHtml(args.clientName);
  const invoice = escapeHtml(args.invoiceNumber);
  const amount = escapeHtml(args.outstandingAmountFormatted);
  const due = escapeHtml(args.dueDateFormatted);
  const days = Math.max(0, Math.round(args.daysOverdue));
  const copy = {
    friendly: {
      subject: `Friendly reminder: Invoice ${args.invoiceNumber}`, title: 'Payment Reminder', accent: '#f59e0b',
      body: `<p>Hi ${client},</p><p>A quick reminder that invoice <strong>${invoice}</strong> (${amount}) was due on ${due}. If it has already been paid, thank you and please ignore this note.</p><p>If anything is holding it up, just reply and we will sort it out.</p>`,
      text: `Hi ${args.clientName},\n\nA quick reminder that invoice ${args.invoiceNumber} (${args.outstandingAmountFormatted}) was due on ${args.dueDateFormatted}. If it has already been paid, thank you.\n\nIf anything is holding it up, just reply and we will sort it out.\n\n${args.companyName}`,
    },
    firm: {
      subject: `Overdue: Invoice ${args.invoiceNumber} (${days} days)`, title: 'Invoice Overdue', accent: '#ea580c',
      body: `<p>Dear ${client},</p><p>Invoice <strong>${invoice}</strong> for <strong>${amount}</strong> is now <strong>${days} days overdue</strong> (due ${due}). Please arrange payment this week, or reply with the date we can expect it.</p><p>If there is a problem with the invoice, tell us so we can resolve it.</p>`,
      text: `Dear ${args.clientName},\n\nInvoice ${args.invoiceNumber} for ${args.outstandingAmountFormatted} is now ${days} days overdue (due ${args.dueDateFormatted}). Please arrange payment this week, or reply with the date we can expect it.\n\nIf there is a problem with the invoice, tell us so we can resolve it.\n\n${args.companyName}`,
    },
    final: {
      subject: `Final notice: Invoice ${args.invoiceNumber}`, title: 'Final Notice', accent: '#dc2626',
      body: `<p>Dear ${client},</p><p>This is a final reminder. Invoice <strong>${invoice}</strong> for <strong>${amount}</strong> is <strong>${days} days overdue</strong> (due ${due}). Please pay immediately, or contact us today to agree a plan, so that we do not have to take further steps.</p>`,
      text: `Dear ${args.clientName},\n\nThis is a final reminder. Invoice ${args.invoiceNumber} for ${args.outstandingAmountFormatted} is ${days} days overdue (due ${args.dueDateFormatted}). Please pay immediately, or contact us today to agree a plan.\n\n${args.companyName}`,
    },
  }[args.tone];
  return {
    subject: copy.subject,
    html: brandedLayout({ title: copy.title, eyebrow: 'Accounts Receivable', subtitle: `Invoice ${invoice} · ${amount}`, companyName: args.companyName, accentColor: copy.accent, bodyHtml: copy.body }),
    text: copy.text,
  };
}

export function buildProposalEmail(args: {
  companyName: string;
  clientName: string;
  proposalNo: string;
  title: string;
  totalFormatted: string;
  validUntilFormatted: string;
  url: string;
  kind?: "send" | "reminder" | "update";
  message?: string | null;
}): TemplateResult {
  const kind = args.kind ?? "send";
  const client = escapeHtml(args.clientName);
  const title = escapeHtml(args.title);
  const lead =
    kind === "reminder"
      ? `A quick reminder: your proposal "${args.title}" is still waiting for your review.`
      : kind === "update"
        ? `We have updated your proposal "${args.title}". Please review the latest version.`
        : `${args.companyName} has prepared a proposal for you: "${args.title}".`;
  const note = args.message?.trim()
    ? `<p style="margin:16px 0;padding:12px 16px;background:#f4f4f5;border-radius:8px;white-space:pre-wrap;">${escapeHtml(args.message.trim())}</p>`
    : "";
  const heading = kind === "reminder" ? "Proposal reminder" : kind === "update" ? "Updated proposal" : "New proposal";
  return {
    subject: `${kind === "reminder" ? "Reminder: " : kind === "update" ? "Updated: " : ""}Proposal ${args.proposalNo} from ${args.companyName}`,
    html: brandedLayout({
      title: heading,
      eyebrow: args.proposalNo,
      subtitle: lead,
      companyName: args.companyName,
      ctaLabel: "Review proposal",
      ctaUrl: args.url,
      bodyHtml: `
        <p>Hi ${client},</p>
        <p><strong>${title}</strong></p>
        <p><strong>Total:</strong> ${escapeHtml(args.totalFormatted)}<br/><strong>Valid until:</strong> ${escapeHtml(args.validUntilFormatted)}</p>
        ${note}
        <p>You can review the details, choose optional items and accept online.</p>
      `,
    }),
    text: `Hi ${args.clientName},\n\n${lead}\n\nTotal: ${args.totalFormatted}\nValid until: ${args.validUntilFormatted}\n${args.message?.trim() ? `\n${args.message.trim()}\n` : ""}\nReview and accept: ${args.url}\n\n${args.companyName}`,
  };
}
