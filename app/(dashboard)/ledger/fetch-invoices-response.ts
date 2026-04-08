import { parseApiMoney } from "@/lib/money-client";

type UnknownRecord = Record<string, unknown>;

type LedgerMeta = {
  currentPage: number;
  totalPages: number;
  kpis: {
    totalRevenue: number;
    outstanding: number;
    presumptiveIncome: number;
  };
};

export const DEFAULT_LEDGER_META: LedgerMeta = {
  currentPage: 1,
  totalPages: 1,
  kpis: {
    totalRevenue: 0,
    outstanding: 0,
    presumptiveIncome: 0,
  },
};

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
};

const asFiniteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asMoneyNumber = (value: unknown, fallback: number) => parseApiMoney(value as string | number, fallback);

const formatApiErrorMessage = (error?: string, code?: string) => {
  if (error && code) return `${error} (${code})`;
  return error || code || null;
};

export const resolveLedgerErrorToastMessage = (
  status: number,
  payload: unknown,
  fallback = "Failed to load ledger data."
) => {
  const payloadObj = asRecord(payload);
  const error = typeof payloadObj?.error === "string" ? payloadObj.error : undefined;
  const code = typeof payloadObj?.code === "string" ? payloadObj.code : undefined;
  const backendMessage = formatApiErrorMessage(error, code);

  if (backendMessage) return backendMessage;
  if (status === 401) return "You are not authorized to view ledger data.";
  if (status >= 500) return "Ledger service is temporarily unavailable. Please try again.";
  return fallback;
};

export const resolveLedgerMalformedJsonToastMessage = () =>
  "Ledger response was not valid JSON. Please refresh and try again.";

export const parseLedgerInvoicesResponse = (payload: unknown) => {
  const payloadObj = asRecord(payload);
  if (!payloadObj) return null;

  if (!Array.isArray(payloadObj.data)) return null;
  const metaObj = asRecord(payloadObj.meta);
  if (!metaObj) return null;

  const kpisObj = asRecord(metaObj.kpis);
  return {
    data: payloadObj.data,
    meta: {
      currentPage: asFiniteNumber(metaObj.currentPage, DEFAULT_LEDGER_META.currentPage),
      totalPages: asFiniteNumber(metaObj.totalPages, DEFAULT_LEDGER_META.totalPages),
      kpis: {
        totalRevenue: asMoneyNumber(kpisObj?.totalRevenue, DEFAULT_LEDGER_META.kpis.totalRevenue),
        outstanding: asMoneyNumber(kpisObj?.outstanding, DEFAULT_LEDGER_META.kpis.outstanding),
        presumptiveIncome: asMoneyNumber(
          kpisObj?.presumptiveIncome,
          DEFAULT_LEDGER_META.kpis.presumptiveIncome
        ),
      },
    },
  };
};
