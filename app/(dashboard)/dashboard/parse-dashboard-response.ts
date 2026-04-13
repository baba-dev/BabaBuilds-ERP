import { parseApiMoney } from "@/lib/money-client";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
};

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const mapMoneyArray = (rows: unknown[], key: string) =>
  rows.map((row) => {
    const obj = asRecord(row);
    if (!obj) return row;

    return {
      ...obj,
      [key]: parseApiMoney(obj[key] as string | number),
    };
  });

export const parseDashboardResponse = (payload: unknown) => {
  const obj = asRecord(payload);
  if (!obj) return null;

  const health = asRecord(obj.health);
  const attention = asRecord(obj.attention);
  const financialPulse = asRecord(obj.financialPulse);
  const salesAndShop = asRecord(obj.salesAndShop);
  const operations = asRecord(obj.operations);
  const trust = asRecord(obj.trust);
  const charts = asRecord(obj.charts);

  if (!health || !attention || !financialPulse || !salesAndShop || !operations || !trust || !charts || !Array.isArray(obj.recentInvoices)) {
    return null;
  }

  const topServices = Array.isArray(salesAndShop.topServices) ? salesAndShop.topServices : [];
  const recentServiceOrders = Array.isArray(salesAndShop.recentServiceOrders) ? salesAndShop.recentServiceOrders : [];
  const receivablesAging = Array.isArray(charts.receivablesAging) ? charts.receivablesAging : [];
  const proposalFunnel = Array.isArray(charts.proposalFunnel) ? charts.proposalFunnel : [];
  const serviceOrderHealth = Array.isArray(charts.serviceOrderHealth) ? charts.serviceOrderHealth : [];
  const revenueVsExpense = Array.isArray(charts.revenueVsExpense) ? charts.revenueVsExpense : [];
  const recurringRevenue = Array.isArray(charts.recurringRevenue) ? charts.recurringRevenue : [];

  return {
    ...obj,
    financialPulse: {
      ...financialPulse,
      billedRevenue: parseApiMoney(financialPulse.billedRevenue as string | number),
      receivables: parseApiMoney(financialPulse.receivables as string | number),
      expenses: parseApiMoney(financialPulse.expenses as string | number),
      estimatedTax: parseApiMoney(financialPulse.estimatedTax as string | number),
      liquidAssets: parseApiMoney(financialPulse.liquidAssets as string | number),
      recurringRevenue: parseApiMoney(financialPulse.recurringRevenue as string | number),
      arr: parseApiMoney(financialPulse.arr as string | number),
      reconciliationProgress: asNumber(financialPulse.reconciliationProgress),
    },
    salesAndShop: {
      ...salesAndShop,
      serviceOrderConversion: asNumber(salesAndShop.serviceOrderConversion),
      shopRevenueThisMonth: parseApiMoney(salesAndShop.shopRevenueThisMonth as string | number),
      ordersLast30Days: asNumber(salesAndShop.ordersLast30Days),
      publishedServices: asNumber(salesAndShop.publishedServices as unknown),
      topServices: mapMoneyArray(topServices, "revenue"),
      recentServiceOrders: mapMoneyArray(recentServiceOrders, "amount"),
    },
    charts: {
      ...charts,
      revenueVsExpense: revenueVsExpense.map((point) => {
        const row = asRecord(point);
        if (!row) return point;
        return {
          ...row,
          revenue: parseApiMoney(row.revenue as string | number),
          expenses: parseApiMoney(row.expenses as string | number),
        };
      }),
      recurringRevenue: recurringRevenue.map((point) => {
        const row = asRecord(point);
        if (!row) return point;
        return {
          ...row,
          mrr: parseApiMoney(row.mrr as string | number),
        };
      }),
      receivablesAging: mapMoneyArray(receivablesAging, "value"),
      proposalFunnel: proposalFunnel.map((point) => {
        const row = asRecord(point);
        if (!row) return point;
        return {
          ...row,
          value: asNumber(row.value),
        };
      }),
      serviceOrderHealth: serviceOrderHealth.map((point) => {
        const row = asRecord(point);
        if (!row) return point;
        return {
          ...row,
          value: asNumber(row.value),
        };
      }),
    },
  };
};
