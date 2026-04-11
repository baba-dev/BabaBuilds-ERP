import type { NavGroup } from "@/src/config/navigation";

export function filterByFlag(groups: NavGroup[], flags: Record<string, boolean> = {}): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (item.featureFlag ? Boolean(flags[item.featureFlag]) : true)),
    }))
    .filter((group) => group.items.length > 0);
}
