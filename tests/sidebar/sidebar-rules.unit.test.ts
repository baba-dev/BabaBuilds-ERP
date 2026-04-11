import { describe, expect, it } from "vitest";
import {
  enforcePinLimit,
  filterSidebarItemsByRole,
  isOnboardingGateBlocking,
  shouldShowAskAiForEmptySearch,
  type SidebarItem,
} from "@/lib/sidebar/sidebar-rules";

const items: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", roles: ["OWNER", "ADMIN", "MEMBER", "VIEWER"] },
  { id: "tax", label: "Tax", path: "/tax", roles: ["OWNER", "ADMIN"] },
  { id: "settings", label: "Settings", path: "/settings", roles: ["OWNER", "ADMIN", "MEMBER"], onboardingRequired: true },
];

describe("sidebar rules (unit)", () => {
  it("filters items by role visibility", () => {
    const memberVisible = filterSidebarItemsByRole(items, "MEMBER");
    expect(memberVisible.map((item) => item.id)).toEqual(["dashboard", "settings"]);
  });

  it("enforces pin max of 3 with dedupe", () => {
    const pinned = enforcePinLimit(["a", "a", "b", "c", "d"]);
    expect(pinned).toEqual(["a", "b", "c"]);
  });

  it("shows Ask AI on empty result only for non-empty query", () => {
    expect(shouldShowAskAiForEmptySearch("invoice", 0)).toBe(true);
    expect(shouldShowAskAiForEmptySearch("   ", 0)).toBe(false);
    expect(shouldShowAskAiForEmptySearch("invoice", 2)).toBe(false);
  });

  it("blocks onboarding-gated item until onboarding is complete", () => {
    expect(isOnboardingGateBlocking(items[2], false)).toBe(true);
    expect(isOnboardingGateBlocking(items[2], true)).toBe(false);
    expect(isOnboardingGateBlocking(items[0], false)).toBe(false);
  });
});
