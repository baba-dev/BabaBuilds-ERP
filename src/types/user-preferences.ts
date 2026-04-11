export const MAX_PINNED_ITEMS = 3;

export type SidebarItemId =
  | "dashboard"
  | "service_catalog"
  | "shop"
  | "inventory"
  | "client_crm"
  | "quotes_proposals"
  | "retainers_hub"
  | "expenses_margins"
  | "savings_tax"
  | "ai_reconciliation"
  | "invoices_and_earnings"
  | "ca_compliance"
  | "settings";

export type UserPreferences = {
  pinnedIds: SidebarItemId[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  recentItems: SidebarItemId[];
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  pinnedIds: [],
  sidebarCollapsed: false,
  sidebarWidth: 256,
  recentItems: [],
};

const ALLOWED_IDS = new Set<SidebarItemId>([
  "dashboard",
  "service_catalog",
  "shop",
  "inventory",
  "client_crm",
  "quotes_proposals",
  "retainers_hub",
  "expenses_margins",
  "savings_tax",
  "ai_reconciliation",
  "invoices_and_earnings",
  "ca_compliance",
  "settings",
]);

export function sanitizeUserPreferences(input: unknown): UserPreferences {
  const source = typeof input === "object" && input !== null ? (input as Partial<UserPreferences>) : {};

  const pinnedIds = Array.isArray(source.pinnedIds)
    ? source.pinnedIds.filter((id): id is SidebarItemId => typeof id === "string" && ALLOWED_IDS.has(id as SidebarItemId)).slice(0, MAX_PINNED_ITEMS)
    : DEFAULT_USER_PREFERENCES.pinnedIds;

  const recentItems = Array.isArray(source.recentItems)
    ? source.recentItems.filter((id): id is SidebarItemId => typeof id === "string" && ALLOWED_IDS.has(id as SidebarItemId)).slice(0, 10)
    : DEFAULT_USER_PREFERENCES.recentItems;

  const rawWidth = Number(source.sidebarWidth);
  const sidebarWidth = Number.isFinite(rawWidth)
    ? Math.min(360, Math.max(220, Math.round(rawWidth)))
    : DEFAULT_USER_PREFERENCES.sidebarWidth;

  return {
    pinnedIds,
    sidebarCollapsed: Boolean(source.sidebarCollapsed),
    sidebarWidth,
    recentItems,
  };
}
