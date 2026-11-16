const MS_PER_DAY = 86_400_000;

export function formatShortDate(value: string | Date, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

/** "Nov" for a `YYYY-MM` month id, in the viewer's language. */
export function formatMonthLabel(monthId: string, locale: string, fallback = ""): string {
  const [year, month] = monthId.split("-").map(Number);
  if (!year || !month) return fallback;
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "3 days ago" / "in 2 days", picking the largest unit that fits. */
export function formatRelative(value: string | Date, locale: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), "minute");
  if (abs < MS_PER_DAY) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  if (abs < 30 * MS_PER_DAY) return rtf.format(Math.round(diffMs / MS_PER_DAY), "day");
  return rtf.format(Math.round(diffMs / (30 * MS_PER_DAY)), "month");
}

/** Calendar days from today to `value`: 0 today, 1 tomorrow, negative in the past. */
export function daysUntil(value: string | Date, now: Date = new Date()): number {
  const date = new Date(value);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(date) - startOf(now)) / MS_PER_DAY);
}

/** Whole-unit currency for headline figures, where paise are noise. */
export function formatMoneyWhole(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

/** "₹1.2L" / "$12K" for chart axes and tight spaces. */
export function formatMoneyCompact(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

/** Percentage change, or `null` when there is no earlier figure to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** "invoice.payment_recorded" / "INVOICE_CREATED" -> "Invoice payment recorded". */
export function humanizeAction(action: string): string {
  const words = action.replace(/[._:/-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}
