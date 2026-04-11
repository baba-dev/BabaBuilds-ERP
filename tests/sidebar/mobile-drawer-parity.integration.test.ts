import { describe, expect, it } from "vitest";
import { hasMobileDrawerParity } from "@/lib/sidebar/sidebar-rules";

describe("sidebar mobile drawer parity (integration)", () => {
  it("keeps desktop and mobile route order/content in parity", () => {
    const desktop = [{ id: "dashboard" }, { id: "clients" }, { id: "settings" }];
    const mobile = [{ id: "dashboard" }, { id: "clients" }, { id: "settings" }];

    expect(hasMobileDrawerParity(desktop, mobile)).toBe(true);
  });

  it("fails parity when an item is missing or ordered differently", () => {
    const desktop = [{ id: "dashboard" }, { id: "clients" }, { id: "settings" }];
    const mobile = [{ id: "dashboard" }, { id: "settings" }];

    expect(hasMobileDrawerParity(desktop, mobile)).toBe(false);
  });
});
