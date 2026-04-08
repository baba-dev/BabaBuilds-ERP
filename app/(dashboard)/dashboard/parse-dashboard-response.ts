import { parseApiMoney } from "@/lib/money-client";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
};

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const parseDashboardResponse = (payload: unknown) => {
  const obj = asRecord(payload);
  if (!obj) return null;

  const kpis = asRecord(obj.kpis);
  const mrr = asRecord(obj.mrr);
  const charts = asRecord(obj.charts);

  if (!kpis || !mrr || !charts || !Array.isArray(obj.recentInvoices)) {
    return null;
  }

  const retainers = Array.isArray(mrr.retainers) ? mrr.retainers : [];
  const revenue = Array.isArray(charts.revenue) ? charts.revenue : [];
  const wealth = Array.isArray(charts.wealth) ? charts.wealth : [];

  return {
    ...obj,
    kpis: {
      totalRevenue: parseApiMoney(kpis.totalRevenue as string | number),
      totalWealth: parseApiMoney(kpis.totalWealth as string | number),
      estimatedTax: parseApiMoney(kpis.estimatedTax as string | number),
      activeClients: asNumber(kpis.activeClients, 0),
    },
    mrr: {
      ...mrr,
      total: parseApiMoney(mrr.total as string | number),
      retainers: retainers.map((retainer) => {
        const row = asRecord(retainer);
        if (!row) return retainer;
        return {
          ...row,
          amount: parseApiMoney(row.amount as string | number),
        };
      }),
    },
    charts: {
      ...charts,
      revenue: revenue.map((point) => {
        const row = asRecord(point);
        if (!row) return point;
        return {
          ...row,
          revenue: parseApiMoney(row.revenue as string | number),
        };
      }),
      wealth: wealth.map((point) => {
        const row = asRecord(point);
        if (!row) return point;
        return {
          ...row,
          value: parseApiMoney(row.value as string | number),
        };
      }),
    },
  };
};
