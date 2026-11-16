export function money(value: number, currency: string, locale: string) {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${currency} ${Math.round(value).toLocaleString(locale)}`; }
}
export type Overview = {
  groupId: string; name: string;
  companies: { workspaceId: string; name: string; countryCode: string; baseCurrency: string; relationType: string; isPrimary: boolean; isArchived: boolean; isCurrent: boolean; members: number; modules: string[]; setup: { score: number; issues: string[] }; revenue30d: number; outstanding: number; overdueCount: number; overdueAmount: number; expenses30d: number; invoices30d: number }[];
  totals: { currency: string; revenue30d: number; outstanding: number; overdueAmount: number; expenses30d: number; companies: number }[];
  needsAttention: { workspaceId: string; name: string; reason: "SETUP" | "OVERDUE" }[];
};
