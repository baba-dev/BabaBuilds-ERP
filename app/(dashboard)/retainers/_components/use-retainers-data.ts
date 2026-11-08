"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RetainerDisplayStatus } from "@/lib/retainers/status";
import { STATUS_ORDER } from "./retainer-utils";

export { useJson } from "@/app/(dashboard)/income/_components/use-income-data";

export type RetainerSort = "nextBillingDate" | "createdAt" | "name" | "status";
const SORTS: RetainerSort[] = ["nextBillingDate", "createdAt", "name", "status"];

export type RetainerFilters = {
  q: string;
  status: RetainerDisplayStatus[];
  frequency: string;
  clientId: string;
  sort: RetainerSort;
  dir: "asc" | "desc";
  page: number;
};

/** All table state lives in the URL so views are shareable and back/forward works. */
export function useRetainersUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const filters: RetainerFilters = useMemo(() => {
    const sort = sp.get("sort") as RetainerSort | null;
    const page = Number(sp.get("page") ?? 1);
    return {
      q: sp.get("q") ?? "",
      status: (sp.get("status") ?? "").split(",").map((s) => s.trim()).filter((s): s is RetainerDisplayStatus => (STATUS_ORDER as string[]).includes(s)),
      frequency: ["MONTHLY", "QUARTERLY", "ANNUALLY"].includes(sp.get("frequency") ?? "") ? (sp.get("frequency") as string) : "",
      clientId: sp.get("clientId") ?? "",
      sort: sort && SORTS.includes(sort) ? sort : "nextBillingDate",
      dir: sp.get("dir") === "desc" ? "desc" : "asc",
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  }, [sp]);

  const retainerId = sp.get("retainer");
  const focus = sp.get("protocolEntity") === "retainer" ? sp.get("protocolRecord") : null;

  const update = useCallback(
    (patch: Partial<RetainerFilters> & { retainer?: string | null }) => {
      const next = new URLSearchParams(sp.toString());
      const set = (k: string, v: string | null | undefined) => (v ? next.set(k, v) : next.delete(k));
      if ("q" in patch) set("q", patch.q);
      if ("status" in patch) set("status", (patch.status ?? []).join(","));
      if ("frequency" in patch) set("frequency", patch.frequency);
      if ("clientId" in patch) set("clientId", patch.clientId);
      if ("sort" in patch) set("sort", patch.sort === "nextBillingDate" ? "" : patch.sort);
      if ("dir" in patch) set("dir", patch.dir === "asc" ? "" : patch.dir);
      if ("page" in patch) set("page", patch.page && patch.page > 1 ? String(patch.page) : "");
      if ("retainer" in patch) set("retainer", patch.retainer);
      next.delete("protocolEntity");
      next.delete("protocolRecord");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp],
  );
  return { filters, retainerId, focus, update };
}

export function buildListUrl(f: RetainerFilters, limit: number, focus?: string | null) {
  const p = new URLSearchParams({ limit: String(limit), page: String(f.page), sort: f.sort, dir: f.dir });
  if (f.q) p.set("q", f.q);
  if (f.status.length) p.set("status", f.status.join(","));
  if (f.frequency) p.set("frequency", f.frequency);
  if (f.clientId) p.set("clientId", f.clientId);
  if (focus) p.set("focus", focus);
  return `/api/retainers?${p.toString()}`;
}
