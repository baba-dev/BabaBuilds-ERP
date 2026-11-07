"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fyLabelFor } from "@/lib/invoices/period";
import type { InvoiceDisplayStatus, InvoiceSourceValue } from "@/lib/invoices/types";

/**
 * Fetch JSON with cancellation. Keeps the previous data on screen while a new request is in flight.
 * `loading` is derived (request key vs the key of the last settled result), so no state is set synchronously in the effect.
 */
export function useJson<T>(url: string | null) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });
  const key = url ? `${url}#${version}` : null;

  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (payload && typeof payload.error === "string" && payload.error) ||
            (payload?.error && typeof payload.error.message === "string" && payload.error.message) ||
            `Request failed (${res.status})`;
          throw new Error(message);
        }
        setResult({ key, data: payload as T, error: null });
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setResult((prev) => ({ key, data: prev.data, error: e instanceof Error ? e.message : "Request failed" }));
      }
    })();
    return () => controller.abort();
  }, [url, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const loading = key !== null && result.key !== key;
  return { data: result.data, error: loading ? null : result.error, loading, reload };
}

export type IncomeFilters = {
  q: string;
  status: InvoiceDisplayStatus[];
  source: InvoiceSourceValue[];
  currency: string;
  clientId: string;
  fy: string; // "26-27" | "all"
  sort: "invoiceDate" | "dueDate" | "invoiceNumber" | "clientName" | "amount" | "status";
  dir: "asc" | "desc";
  page: number;
};

const SORTS = ["invoiceDate", "dueDate", "invoiceNumber", "clientName", "amount", "status"] as const;
const STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const;
const SOURCES = ["MANUAL", "PROPOSAL", "RETAINER", "POS", "SHOP", "API"] as const;

/** All table state lives in the URL so views are shareable, and back/forward works. */
export function useIncomeUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFy = useMemo(() => fyLabelFor(new Date()), []);

  const filters: IncomeFilters = useMemo(() => {
    const csv = (key: string) => (searchParams.get(key) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const sort = searchParams.get("sort");
    const page = Number(searchParams.get("page") ?? 1);
    return {
      // `search` is the legacy param used by proposal/pipeline links.
      q: searchParams.get("q") ?? searchParams.get("search") ?? "",
      status: csv("status").filter((v): v is InvoiceDisplayStatus => (STATUSES as readonly string[]).includes(v)),
      source: csv("source").filter((v): v is InvoiceSourceValue => (SOURCES as readonly string[]).includes(v)),
      currency: (searchParams.get("currency") ?? "").toUpperCase(),
      clientId: searchParams.get("clientId") ?? "",
      fy: searchParams.get("fy") ?? currentFy,
      sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as IncomeFilters["sort"]) : "invoiceDate",
      dir: searchParams.get("dir") === "asc" ? "asc" : "desc",
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  }, [searchParams, currentFy]);

  // `invoiceId` is the legacy param used by cash-flow links.
  const invoiceId = searchParams.get("invoice") ?? searchParams.get("invoiceId");
  const focus = searchParams.get("protocolEntity") === "invoice" ? searchParams.get("protocolRecord") : null;

  const update = useCallback(
    (patch: Partial<IncomeFilters> & { invoice?: string | null }, options: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      const set = (key: string, value: string | null) => {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      };
      if ("q" in patch) set("q", patch.q ?? "");
      if ("status" in patch) set("status", (patch.status ?? []).join(","));
      if ("source" in patch) set("source", (patch.source ?? []).join(","));
      if ("currency" in patch) set("currency", patch.currency ?? "");
      if ("clientId" in patch) set("clientId", patch.clientId ?? "");
      if ("fy" in patch) set("fy", patch.fy === currentFy ? "" : patch.fy ?? "");
      if ("sort" in patch) set("sort", patch.sort === "invoiceDate" ? "" : patch.sort ?? "");
      if ("dir" in patch) set("dir", patch.dir === "desc" ? "" : patch.dir ?? "");
      if ("page" in patch) set("page", patch.page && patch.page > 1 ? String(patch.page) : "");
      if ("invoice" in patch) set("invoice", patch.invoice ?? "");
      if (options.resetPage) next.delete("page");
      // Legacy params are migrated to their new names on the first change.
      next.delete("search");
      next.delete("invoiceId");
      if (!("q" in patch) && filters.q) next.set("q", filters.q);
      if (!("invoice" in patch) && invoiceId) next.set("invoice", invoiceId);
      // A deep link is consumed once the page has been resolved.
      next.delete("protocolEntity");
      next.delete("protocolRecord");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [currentFy, filters.q, invoiceId, pathname, router, searchParams],
  );

  return { filters, invoiceId, focus, update, currentFy };
}

export function buildListUrl(filters: IncomeFilters, limit = 15, focus?: string | null): string {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  p.set("page", String(filters.page));
  if (filters.q) p.set("q", filters.q);
  if (filters.status.length) p.set("status", filters.status.join(","));
  if (filters.source.length) p.set("source", filters.source.join(","));
  if (filters.currency) p.set("currency", filters.currency);
  if (filters.clientId) p.set("clientId", filters.clientId);
  p.set("fy", filters.fy);
  p.set("sort", filters.sort);
  p.set("dir", filters.dir);
  if (focus) p.set("focus", focus);
  return `/api/invoices?${p.toString()}`;
}

export function buildExportUrl(filters: IncomeFilters): string {
  const url = new URL(buildListUrl({ ...filters, page: 1 }, 100), "http://x");
  url.searchParams.delete("page");
  url.searchParams.delete("limit");
  return `/api/invoices/export${url.search}`;
}
