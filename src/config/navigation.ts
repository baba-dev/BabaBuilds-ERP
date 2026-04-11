export type SidebarModuleKey =
  | "client_crm"
  | "quotes_proposals"
  | "invoices_and_earnings"
  | "ai_reconciliation"
  | "ca_compliance";

export type SidebarBadgeVariant = "count" | "dot" | "new";

export type SidebarBadge = {
  variant: SidebarBadgeVariant;
  count?: number;
};

export type SidebarBadgeSource = {
  key: SidebarModuleKey;
  endpoint: string;
  staleAfterMs: number;
  failureFallback: "hide" | "dot";
};

export const SIDEBAR_BADGE_SOURCES: Record<SidebarModuleKey, SidebarBadgeSource> = {
  client_crm: {
    key: "client_crm",
    endpoint: "/api/clients?page=1&limit=50",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  quotes_proposals: {
    key: "quotes_proposals",
    endpoint: "/api/proposals",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  invoices_and_earnings: {
    key: "invoices_and_earnings",
    endpoint: "/api/invoices/open-count",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  ai_reconciliation: {
    key: "ai_reconciliation",
    endpoint: "/api/dashboard",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  ca_compliance: {
    key: "ca_compliance",
    endpoint: "/api/ca-portal",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
};

export const SIDEBAR_BADGE_MODULE_KEYS = Object.keys(SIDEBAR_BADGE_SOURCES) as SidebarModuleKey[];

export const isSidebarBadgeModuleKey = (value: string): value is SidebarModuleKey =>
  value in SIDEBAR_BADGE_SOURCES;
