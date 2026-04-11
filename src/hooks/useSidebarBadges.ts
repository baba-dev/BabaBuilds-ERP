"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SIDEBAR_BADGE_MODULE_KEYS,
  SIDEBAR_BADGE_SOURCES,
  type SidebarBadge,
  type SidebarModuleKey,
} from "@/src/config/navigation";

type JsonRecord = Record<string, unknown>;

type SidebarBadgeState = {
  badge: SidebarBadge | null;
  isLoading: boolean;
  isStale: boolean;
  hasError: boolean;
  updatedAt: number | null;
};

type SidebarBadgeMap = Record<SidebarModuleKey, SidebarBadgeState>;

type UseSidebarBadgesOptions = {
  pollIntervalMs?: number;
  staleAfterMs?: number;
};

const OPEN_INVOICE_STATUSES = new Set(["PENDING", "PARTIALLY_PAID", "OVERDUE", "SENT"]);
const APPROVAL_PENDING_PROPOSAL_STATUSES = new Set(["SENT", "VIEWED", "PENDING"]);

const initialState = (): SidebarBadgeMap =>
  SIDEBAR_BADGE_MODULE_KEYS.reduce((acc, key) => {
    acc[key] = {
      badge: null,
      isLoading: true,
      isStale: false,
      hasError: false,
      updatedAt: null,
    };
    return acc;
  }, {} as SidebarBadgeMap);

const normalizeStatus = (status: unknown) => String(status ?? "").toUpperCase();

const withFailureFallback = (key: SidebarModuleKey): SidebarBadge | null => {
  const source = SIDEBAR_BADGE_SOURCES[key];
  return source.failureFallback === "dot" ? { variant: "dot" } : null;
};

const toObjectArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter((entry): entry is JsonRecord => typeof entry === "object" && entry !== null) : [];

const parseBadge = (key: SidebarModuleKey, payload: unknown): SidebarBadge | null => {
  const safePayload = (typeof payload === "object" && payload !== null ? payload : {}) as JsonRecord;

  switch (key) {
    case "client_crm": {
      const meta = (safePayload.meta as JsonRecord | undefined) ?? {};
      const data = toObjectArray(safePayload.data);
      const count = Number(meta.totalRecords ?? data.length ?? 0);
      return count > 0 ? { variant: "count", count } : null;
    }
    case "quotes_proposals": {
      const proposals = toObjectArray(payload);
      const pendingApprovals = proposals.filter((proposal) => APPROVAL_PENDING_PROPOSAL_STATUSES.has(normalizeStatus(proposal.status))).length;
      return pendingApprovals > 0 ? { variant: "count", count: pendingApprovals } : null;
    }
    case "invoices_and_earnings": {
      const invoices = toObjectArray(safePayload.data);
      const unresolvedInvoices = invoices.filter((invoice) => OPEN_INVOICE_STATUSES.has(normalizeStatus(invoice.status))).length;
      return unresolvedInvoices > 0 ? { variant: "count", count: unresolvedInvoices } : null;
    }
    case "ai_reconciliation": {
      const recentInvoices = toObjectArray(safePayload.recentInvoices);
      const needsReview = recentInvoices.filter((invoice) => OPEN_INVOICE_STATUSES.has(normalizeStatus(invoice.status))).length;
      if (needsReview > 0) {
        return { variant: "count", count: needsReview };
      }

      const readiness = (safePayload.readiness as JsonRecord | undefined) ?? {};
      const summary = (readiness.summary as JsonRecord | undefined) ?? {};
      const partialIntegrations = Number(summary.partial ?? 0);
      return partialIntegrations > 0 ? { variant: "dot" } : null;
    }
    case "ca_compliance": {
      const invoices = toObjectArray(safePayload.invoices);
      const pending = invoices.filter((invoice) => OPEN_INVOICE_STATUSES.has(normalizeStatus(invoice.status))).length;
      return pending > 0 ? { variant: "new" } : null;
    }
    default:
      return null;
  }
};

export function useSidebarBadges(options?: UseSidebarBadgesOptions) {
  const pollIntervalMs = options?.pollIntervalMs ?? 90_000;
  const globalStaleAfterMs = options?.staleAfterMs ?? 2 * pollIntervalMs;
  const [badges, setBadges] = useState<SidebarBadgeMap>(initialState);
  const isMountedRef = useRef(false);

  const poll = useCallback(async () => {
    const now = Date.now();

    const results = await Promise.all(
      SIDEBAR_BADGE_MODULE_KEYS.map(async (key) => {
        const source = SIDEBAR_BADGE_SOURCES[key];

        try {
          const response = await fetch(source.endpoint, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`Badge source failed (${source.endpoint}): ${response.status}`);
          }

          const payload = (await response.json()) as unknown;
          return {
            key,
            badge: parseBadge(key, payload),
            hasError: false,
            updatedAt: now,
          } as const;
        } catch (error) {
          console.error("useSidebarBadges poll failed", { key, error });
          return {
            key,
            badge: withFailureFallback(key),
            hasError: true,
            updatedAt: null,
          } as const;
        }
      }),
    );

    if (!isMountedRef.current) {
      return;
    }

    setBadges((previous) => {
      const next = { ...previous };
      for (const result of results) {
        const staleAfterMs = SIDEBAR_BADGE_SOURCES[result.key].staleAfterMs || globalStaleAfterMs;
        const previousEntry = previous[result.key];
        const updatedAt = result.updatedAt ?? previousEntry.updatedAt;

        next[result.key] = {
          badge: result.badge,
          hasError: result.hasError,
          isLoading: false,
          updatedAt,
          isStale: updatedAt ? now - updatedAt > staleAfterMs : true,
        };
      }
      return next;
    });
  }, [globalStaleAfterMs]);

  useEffect(() => {
    isMountedRef.current = true;
    void poll();

    const intervalId = window.setInterval(() => {
      void poll();
    }, Math.max(60_000, pollIntervalMs));

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [poll, pollIntervalMs]);

  const hasAnyLoading = useMemo(
    () => SIDEBAR_BADGE_MODULE_KEYS.some((key) => badges[key].isLoading),
    [badges],
  );

  return {
    badges,
    hasAnyLoading,
    refresh: poll,
  };
}
