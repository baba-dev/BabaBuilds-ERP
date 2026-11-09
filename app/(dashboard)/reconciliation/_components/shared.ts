export type Suggestion = {
  id: string; date: string; description: string; reference: string | null; amount: number; type: "DEBIT" | "CREDIT"; accountId: string | null; accountName: string | null; currency: string;
  category: string | null; isInternalTransfer: boolean; ignoredAt: string | null; ready: boolean;
  invoices: Array<{ invoiceNumber: string; clientName: string; outstanding: number; currency: string; score: number; reasons: string[] }>;
  expenses: Array<{ expenseId: string; vendor: string; amount: number; date: string; unpaid: boolean; score: number; reasons: string[] }>;
  pos: Array<{ poNumber: string; supplier: string; score: number; reasons: string[] }>;
};
export type MatchedRow = { id: string; date: string; description: string; amount: string; type: string | null; accountName: string | null; matchedInvoiceId: string | null; matchedExpenseId: string | null; category: string | null };
export type Summary = {
  total: number; reconciled: number; ignored: number; transfers: number; waiting: number; waitingDebit: { count: number; amount: number }; waitingCredit: { count: number; amount: number };
  canCommit?: boolean; reconciledPercent: number; oldestWaitingDays: number | null; lastImport: { at: string; fileName: string; rows: number } | null; balance: number | null; currency: string | null;
};
export type Account = { id: string; name: string; bankName: string | null; currency: string };
export type CommitSkip = { id: string; reason: string; message: string };

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string; skipped?: CommitSkip[] } }> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; skipped?: CommitSkip[] };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error", code: "NETWORK" } as unknown as T & { error?: string } };
  }
}

export function money(amount: number, currency: string, locale: string) {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; }
}
export function shortDate(iso: string, locale: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}
