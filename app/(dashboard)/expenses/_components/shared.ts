export type ExpenseRow = {
  id: string; date: string; category: string; vendor: string; amount: number; description: string | null; receiptUrl: string | null;
  itcStatus: string; vendorGstin: string | null; vendorInvoiceNo: string | null; vendorStateCode: string | null; hsnCode: string | null; gstRate: number | null; gstAmount: number;
  paymentStatus: "PAID" | "UNPAID"; paidAt: string | null; itcHeld: boolean; vendorMsme: string | null; vendorUdyam: string | null; vendorAgreedDays: number | null;
  withholdingAmount: number | null; ageDays: number | null;
};

export type Summary = {
  currency: string; total: number; count: number; prevTotal: number | null; netOfCredit: number; itcClaimable: number; revenue: number; margin: number | null;
  byCategory: Array<{ category: string; amount: number; count: number; share: number }>;
  topVendors: Array<{ vendor: string; amount: number; count: number }>;
  monthly: Array<{ month: string; amount: number }>;
  unpaid: { count: number; amount: number; items: Array<{ id: string; vendor: string; amount: number; date: string; invoiceNo: string | null; ageDays: number; msme: string | null; agreedDays: number | null }> };
  missingReceipts: number; withholdingPending: { count: number; amount: number };
};

export type Period = "this_month" | "last_month" | "this_fy" | "last_fy" | "all";
export const PERIODS: Period[] = ["this_month", "last_month", "this_fy", "last_fy", "all"];

export type ApiFail = { error?: string; code?: string; fields?: Array<{ field: string; code: string }>; existing?: Array<{ id: string; vendor: string; amount: number; date: string }> };

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & ApiFail }> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T & ApiFail;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error", code: "NETWORK" } as T & ApiFail };
  }
}

export function money(amount: number, currency: string, locale: string, compact = false) {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: compact ? 1 : 2, ...(compact ? { notation: "compact" as const } : {}) }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; }
}

export function shortDate(iso: string, locale: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function monthLabel(ym: string, locale: string) {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
}
