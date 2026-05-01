import { appNavItems, filterAppNavItems, type CanonicalNavItem } from "@/components/navigation/nav-config";

/**
 * @deprecated Use `appNavItems` + `filterAppNavItems` from `nav-config` directly.
 * This projection is kept only for backward compatibility.
 */
export type SidebarItem = Pick<CanonicalNavItem, "key" | "path" | "icon" | "keywords"> & {
  groupKey: CanonicalNavItem["group"];
};

export function getSidebarItems(enabledModules: Set<string>, grantedPermissions: Set<string>): SidebarItem[] {
  return filterAppNavItems(appNavItems, enabledModules, grantedPermissions).map((item) => ({
    key: item.key,
    path: item.path,
    icon: item.icon,
    groupKey: item.group,
    keywords: item.keywords,
  }));
}
