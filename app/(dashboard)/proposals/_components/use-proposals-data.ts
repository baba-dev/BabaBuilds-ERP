"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProposalDisplayStatus } from "@/lib/proposals/status";
import { STATUS_ORDER } from "./proposal-utils";

export { useJson } from "@/app/(dashboard)/income/_components/use-income-data";

export type ProposalSort = "dateCreated" | "validUntil" | "totalAmount" | "title" | "proposalNo" | "status";
const SORTS: ProposalSort[] = ["dateCreated", "validUntil", "totalAmount", "title", "proposalNo", "status"];

export type ProposalFilters = {
  q: string;
  status: ProposalDisplayStatus[];
  clientId: string;
  archived: boolean;
  sort: ProposalSort;
  dir: "asc" | "desc";
  page: number;
};

/** All table state lives in the URL so views are shareable and back/forward works. */
export function useProposalsUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: ProposalFilters = useMemo(() => {
    const sort = searchParams.get("sort") as ProposalSort | null;
    const page = Number(searchParams.get("page") ?? 1);
    return {
      q: searchParams.get("q") ?? "",
      status: (searchParams.get("status") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is ProposalDisplayStatus => (STATUS_ORDER as string[]).includes(s)),
      clientId: searchParams.get("clientId") ?? "",
      archived: searchParams.get("archived") === "1",
      sort: sort && SORTS.includes(sort) ? sort : "dateCreated",
      dir: searchParams.get("dir") === "asc" ? "asc" : "desc",
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  }, [searchParams]);

  const proposalId = searchParams.get("proposal");
  const focus = searchParams.get("protocolEntity") === "proposal" ? searchParams.get("protocolRecord") : null;

  const update = useCallback(
    (patch: Partial<ProposalFilters> & { proposal?: string | null }) => {
      const next = new URLSearchParams(searchParams.toString());
      const set = (key: string, value: string | null | undefined) => {
        if (!value) next.delete(key);
        else next.set(key, value);
      };
      if ("q" in patch) set("q", patch.q);
      if ("status" in patch) set("status", (patch.status ?? []).join(","));
      if ("clientId" in patch) set("clientId", patch.clientId);
      if ("archived" in patch) set("archived", patch.archived ? "1" : "");
      if ("sort" in patch) set("sort", patch.sort === "dateCreated" ? "" : patch.sort);
      if ("dir" in patch) set("dir", patch.dir === "desc" ? "" : patch.dir);
      if ("page" in patch) set("page", patch.page && patch.page > 1 ? String(patch.page) : "");
      if ("proposal" in patch) set("proposal", patch.proposal);
      next.delete("protocolEntity");
      next.delete("protocolRecord");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { filters, proposalId, focus, update };
}

export function buildListUrl(filters: ProposalFilters, limit: number, focus?: string | null) {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  p.set("page", String(filters.page));
  if (filters.q) p.set("q", filters.q);
  if (filters.status.length) p.set("status", filters.status.join(","));
  if (filters.clientId) p.set("clientId", filters.clientId);
  if (filters.archived) p.set("archived", "1");
  p.set("sort", filters.sort);
  p.set("dir", filters.dir);
  if (focus) p.set("focus", focus);
  return `/api/proposals?${p.toString()}`;
}
