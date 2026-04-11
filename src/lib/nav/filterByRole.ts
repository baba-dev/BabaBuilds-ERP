import type { AppRole, NavGroup } from "@/src/config/navigation";

export function filterByRole(groups: NavGroup[], role?: AppRole): NavGroup[] {
  if (!role) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roleVisibility || item.roleVisibility.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}
