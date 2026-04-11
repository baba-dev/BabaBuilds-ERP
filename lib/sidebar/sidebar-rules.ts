export type SidebarRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type SidebarItem = {
  id: string;
  label: string;
  path: string;
  roles: ReadonlyArray<SidebarRole>;
  pinnedToBottom?: boolean;
  onboardingRequired?: boolean;
};

export const MAX_SIDEBAR_PINS = 3;

export function filterSidebarItemsByRole<T extends SidebarItem>(
  items: ReadonlyArray<T>,
  role: SidebarRole,
): T[] {
  return items.filter((item) => item.roles.includes(role));
}

export function enforcePinLimit(pinnedIds: ReadonlyArray<string>, maxPins = MAX_SIDEBAR_PINS): string[] {
  return Array.from(new Set(pinnedIds)).slice(0, maxPins);
}

export function applyBottomPinRule(
  items: ReadonlyArray<SidebarItem>,
  pinnedIds: ReadonlyArray<string>,
): string[] {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const validPinned = Array.from(new Set(pinnedIds.filter((id) => itemMap.has(id))));
  const topPins: string[] = [];
  const bottomPins: string[] = [];

  for (const id of validPinned) {
    const item = itemMap.get(id);
    if (!item) continue;

    if (item.pinnedToBottom) {
      bottomPins.push(id);
    } else {
      topPins.push(id);
    }
  }

  return [...enforcePinLimit(topPins), ...bottomPins];
}

export function shouldShowAskAiForEmptySearch(query: string, resultsCount: number): boolean {
  const normalizedQuery = query.trim();
  return normalizedQuery.length > 0 && resultsCount === 0;
}

export function isOnboardingGateBlocking(
  item: Pick<SidebarItem, "onboardingRequired">,
  hasCompletedOnboarding: boolean,
): boolean {
  if (!item.onboardingRequired) {
    return false;
  }

  return !hasCompletedOnboarding;
}

export function hasMobileDrawerParity(
  desktopItems: ReadonlyArray<Pick<SidebarItem, "id">>,
  mobileItems: ReadonlyArray<Pick<SidebarItem, "id">>,
): boolean {
  if (desktopItems.length !== mobileItems.length) {
    return false;
  }

  return desktopItems.every((item, index) => item.id === mobileItems[index]?.id);
}
