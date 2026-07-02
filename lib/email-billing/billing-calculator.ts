import 'server-only';

type MoneyLike = number | string | { toString(): string } | null | undefined;
export type MailBillingCalculatorPlan = { billingMode: string; currency: string; basePrice: MoneyLike; includedMailboxes?: number | null; extraMailboxPrice?: MoneyLike; name?: string | null };
export type MailBillingCalculatorSubscription = { billingModeSnapshot?: string | null; currencySnapshot?: string | null; basePriceSnapshot?: MoneyLike; includedMailboxesSnapshot?: number | null; extraMailboxPriceSnapshot?: MoneyLike; billableMailboxCount?: number | null; retainerId?: string | null } | null | undefined;
export type MailBillingLineItem = { title: string; quantity: number; unitPrice: number; amount: number };
const n = (value: MoneyLike) => Number(value?.toString?.() ?? value ?? 0);

export function calculateMailBilling(input: { plan?: MailBillingCalculatorPlan | null; subscription?: MailBillingCalculatorSubscription; syncedMailboxCount: number; domain?: string }) {
  const mode = input.subscription?.billingModeSnapshot || input.plan?.billingMode || 'MANUAL';
  const currency = input.subscription?.currencySnapshot || input.plan?.currency || 'INR';
  const baseAmount = n(input.subscription?.basePriceSnapshot ?? input.plan?.basePrice);
  const includedMailboxes = Number(input.subscription?.includedMailboxesSnapshot ?? input.plan?.includedMailboxes ?? 0);
  const extraUnitPrice = n(input.subscription?.extraMailboxPriceSnapshot ?? input.plan?.extraMailboxPrice);
  const billableMailboxCount = Math.max(0, Number(input.subscription?.billableMailboxCount ?? input.syncedMailboxCount ?? 0));
  const domain = input.domain ?? 'domain';
  let extraMailboxCount = 0, extraMailboxAmount = 0, totalRecurringAmount = 0, reviewRequired = false, reviewReason: string | null = null;
  const lineItems: MailBillingLineItem[] = [];
  if (mode === 'FIXED') { totalRecurringAmount = baseAmount; lineItems.push({ title: `Professional Email Hosting - ${domain}`, quantity: 1, unitPrice: baseAmount, amount: baseAmount }); }
  else if (mode === 'PER_MAILBOX') { totalRecurringAmount = billableMailboxCount * baseAmount; lineItems.push({ title: `Email Mailbox Seats - ${domain}`, quantity: billableMailboxCount, unitPrice: baseAmount, amount: totalRecurringAmount }); }
  else if (mode === 'BUNDLE_PLUS_EXTRA') { extraMailboxCount = Math.max(0, billableMailboxCount - includedMailboxes); extraMailboxAmount = extraMailboxCount * extraUnitPrice; totalRecurringAmount = baseAmount + extraMailboxAmount; lineItems.push({ title: `Professional Email Hosting - ${domain}`, quantity: 1, unitPrice: baseAmount, amount: baseAmount }); if (extraMailboxCount > 0) lineItems.push({ title: `Extra Email Mailboxes - ${domain}`, quantity: extraMailboxCount, unitPrice: extraUnitPrice, amount: extraMailboxAmount }); }
  else { reviewRequired = !input.subscription?.retainerId; reviewReason = reviewRequired ? 'Manual subscription requires a linked retainer.' : null; }
  return { billingMode: mode, currency, baseAmount, includedMailboxes, extraMailboxCount, extraMailboxAmount, billableMailboxCount, totalRecurringAmount, lineItems, reviewRequired, reviewReason };
}
