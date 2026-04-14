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
  | "help_center"
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
  "help_center",
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

export function sanitizeUserPreferencesPatch(input: unknown): Partial<UserPreferences> {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const source = input as Partial<UserPreferences>;
  const patch: Partial<UserPreferences> = {};

  if (Array.isArray(source.pinnedIds)) {
    patch.pinnedIds = source.pinnedIds
      .filter((id): id is SidebarItemId => typeof id === "string" && ALLOWED_IDS.has(id as SidebarItemId))
      .slice(0, MAX_PINNED_ITEMS);
  }

  if (typeof source.sidebarCollapsed === "boolean") {
    patch.sidebarCollapsed = source.sidebarCollapsed;
  }

  if (source.sidebarWidth !== undefined) {
    const rawWidth = Number(source.sidebarWidth);
    if (Number.isFinite(rawWidth)) {
      patch.sidebarWidth = Math.min(360, Math.max(220, Math.round(rawWidth)));
    }
  }

  if (Array.isArray(source.recentItems)) {
    patch.recentItems = source.recentItems
      .filter((id): id is SidebarItemId => typeof id === "string" && ALLOWED_IDS.has(id as SidebarItemId))
      .slice(0, 10);
  }

  return patch;
}
