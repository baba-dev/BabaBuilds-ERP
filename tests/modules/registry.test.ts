import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODULE_KEYS } from "@/lib/module-keys";
import { MODULE_REGISTRY, moduleHref } from "@/lib/module-registry";
import { MODULE_CATALOG } from "@/lib/settings/modules-catalog";
import { canonicalNavItems } from "@/components/navigation/nav-config";

const ROOT = path.resolve(__dirname, "../..");
const pageExists = (href: string) => {
  const clean = href.split("?")[0].replace(/^\//, "");
  return fs.existsSync(path.join(ROOT, "app/(dashboard)", clean, "page.tsx")) || fs.existsSync(path.join(ROOT, "app/(dashboard)", clean, "layout.tsx"));
};

describe("module registry", () => {
  it("lists every module exactly once", () => {
    const keys = MODULE_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...MODULE_KEYS].sort());
  });

  it("every link goes to a real page (the dashboard once sent three modules to the wrong one)", () => {
    for (const m of MODULE_REGISTRY) expect(pageExists(m.href), `${m.key} -> ${m.href}`).toBe(true);
  });

  it("only suggests modules that exist, and never itself", () => {
    for (const m of MODULE_REGISTRY) for (const s of m.suggests) {
      expect((MODULE_KEYS as readonly string[]).includes(s)).toBe(true);
      expect(s).not.toBe(m.key);
    }
  });

  it("settings shows everything except the shop, which has its own section", () => {
    expect(MODULE_CATALOG.map((m) => m.key)).not.toContain("SHOP");
    expect(MODULE_CATALOG.map((m) => m.key)).toContain("TAX_ADVANCED");
    expect(MODULE_CATALOG.length).toBe(MODULE_KEYS.length - 1);
  });

  it("falls back to the module settings for an unknown key", () => {
    expect(moduleHref("IMPORT_MANAGER")).toBe("/import-manager");
    expect(moduleHref("MULTI_COMPANY")).toBe("/companies");
    expect(moduleHref("NOPE")).toBe("/settings?section=modules");
  });

  it("menu items that need a module name a module that exists, and Email Billing has one", () => {
    for (const item of canonicalNavItems) if (item.requiresModule) expect((MODULE_KEYS as readonly string[]).includes(item.requiresModule), item.key).toBe(true);
    expect(canonicalNavItems.find((n) => n.requiresModule === "MIAB_BILLING")?.path).toBe("/email-billing");
  });
});
