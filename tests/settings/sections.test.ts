import { describe, expect, it } from "vitest";
import { SECTION_SCHEMAS, validateRegional, secretSchema } from "@/lib/settings/schemas";
import { buildSectionUpdate, changedFields, normalizeShopSlug } from "@/lib/settings/apply";
import { activeKey, HASH_TO_SECTION, isSectionKey, NAV } from "@/lib/settings/nav";
import { MODULE_CATALOG } from "@/lib/settings/modules-catalog";
import { MODULE_KEYS } from "@/lib/module-keys";

const VALID_GSTIN = "27AAPFU0939F1ZV";

describe("section schemas", () => {
  it("requires the identity fields and a valid email, and clears optional ones", () => {
    const bad = SECTION_SCHEMAS.business.safeParse({ companyName: "", proprietorName: "A", address: "x", email: "nope" });
    expect(bad.success).toBe(false);
    const ok = SECTION_SCHEMAS.business.parse({ companyName: " Acme ", proprietorName: "A", address: "1 Road", email: "a@b.in", phone: "", website: "" });
    expect(ok.companyName).toBe("Acme");
    expect(ok.phone).toBeNull();
    expect(SECTION_SCHEMAS.business.safeParse({ companyName: "A", proprietorName: "A", address: "x", email: "a@b.in", website: "javascript:alert(1)" }).success).toBe(false);
  });

  it("validates tax ids and normalises them", () => {
    const ok = SECTION_SCHEMAS.tax.parse({ panNumber: "abcde1234f", gstin: ` ${VALID_GSTIN.toLowerCase()} `, udyamNumber: "udyam mh 12 0000001", defaultSacCode: "99-83 13", defaultTaxRatePercent: 18 });
    expect(ok.panNumber).toBe("ABCDE1234F");
    expect(ok.gstin).toBe(VALID_GSTIN);
    expect(ok.defaultSacCode).toBe("998313");
    expect(SECTION_SCHEMAS.tax.safeParse({ panNumber: "", gstin: "27AAPFU0939F1ZX", defaultSacCode: "998313" }).success).toBe(false);
    expect(SECTION_SCHEMAS.tax.safeParse({ panNumber: "", udyamNumber: "bad", defaultSacCode: "" }).success).toBe(false);
    expect(SECTION_SCHEMAS.tax.safeParse({ panNumber: "", defaultSacCode: "12" }).success).toBe(false);
  });

  it("checks PAN and IFSC only for Indian workspaces", () => {
    expect(validateRegional("tax", { panNumber: "123" }, "IN")).toEqual([{ field: "panNumber", code: "PAN" }]);
    expect(validateRegional("tax", { panNumber: "123" }, "US")).toEqual([]);
    expect(validateRegional("banking", { ifscCode: "HDFC0001234" }, "IN")).toEqual([]);
    expect(validateRegional("banking", { ifscCode: "HDFC1001234" }, "IN")).toEqual([{ field: "ifscCode", code: "IFSC" }]);
  });

  it("limits invoicing values", () => {
    expect(SECTION_SCHEMAS.invoicing.safeParse({ invoiceTheme: "DESIGN_2", invoicePrefix: "inv", invoiceTermsDays: 30 }).success).toBe(true);
    expect(SECTION_SCHEMAS.invoicing.safeParse({ invoiceTheme: "DESIGN_9", invoicePrefix: "INV", invoiceTermsDays: 30 }).success).toBe(false);
    expect(SECTION_SCHEMAS.invoicing.safeParse({ invoiceTheme: "DESIGN_1", invoicePrefix: "bad prefix!", invoiceTermsDays: 7 }).success).toBe(false);
    expect(SECTION_SCHEMAS.invoicing.safeParse({ invoiceTheme: "DESIGN_1", invoicePrefix: "INV", invoiceTermsDays: 4000 }).success).toBe(false);
  });

  it("only accepts a hex accent colour and a real SMTP port", () => {
    expect(SECTION_SCHEMAS.shop.safeParse({ shopEnabled: false, shopSlug: "", shopTagline: "", shopAccentColor: "red" }).success).toBe(false);
    expect(SECTION_SCHEMAS.email.safeParse({ smtpPort: 70000 }).success).toBe(false);
    expect(SECTION_SCHEMAS.email.safeParse({ smtpHost: "smtp.gmail.com", smtpPort: 587, smtpFromEmail: "x" }).success).toBe(false);
  });

  it("secret updates carry a key and a value or null, nothing else", () => {
    expect(secretSchema.safeParse({ key: "smtpPassword", value: "hunter2" }).success).toBe(true);
    expect(secretSchema.safeParse({ key: "smtpPassword", value: null }).success).toBe(true);
    expect(secretSchema.safeParse({ key: "workspaceId", value: "x" }).success).toBe(false);
    expect(secretSchema.safeParse({ key: "groqApiKey", value: "" }).success).toBe(false);
  });
});

describe("what a section writes", () => {
  it("a valid GSTIN sets the state and marks an unregistered business registered", () => {
    const parsed = SECTION_SCHEMAS.tax.parse({ panNumber: "ABCDE1234F", gstin: VALID_GSTIN, defaultSacCode: "998313", defaultTaxRatePercent: 18 });
    const out = buildSectionUpdate("tax", parsed, { gstRegistrationType: "UNREGISTERED" });
    expect(out.gstStateCode).toBe("27");
    expect(out.gstRegistrationType).toBe("REGULAR");
    expect(out.defaultTaxRate).toBe(0.18);
    const composition = buildSectionUpdate("tax", parsed, { gstRegistrationType: "COMPOSITION" });
    expect(composition.gstRegistrationType).toBeUndefined();
  });

  it("empty values clear optional fields and fall back to defaults, never null a required column", () => {
    const tax = buildSectionUpdate("tax", SECTION_SCHEMAS.tax.parse({ panNumber: "", gstin: "", udyamNumber: "", defaultSacCode: "", defaultTaxRatePercent: null }), null);
    expect(tax.gstin).toBeNull();
    expect(tax.udyamNumber).toBeNull();
    expect(tax.defaultSacCode).toBe("998313");
    expect(tax.defaultTaxRate).toBeNull();
    expect(tax.panNumber).toBe("");
    const inv = buildSectionUpdate("invoicing", SECTION_SCHEMAS.invoicing.parse({ invoiceTheme: "DESIGN_1", invoicePrefix: "", invoiceTermsDays: 0 }), null);
    expect(inv.invoicePrefix).toBe("INV");
    expect(inv.invoiceTermsDays).toBe(0);
  });

  it("business and banking sections never touch other sections' columns", () => {
    const biz = buildSectionUpdate("business", SECTION_SCHEMAS.business.parse({ companyName: "A", proprietorName: "B", address: "C", email: "a@b.in", locale: "es" }), null);
    expect(Object.keys(biz).sort()).toEqual(["address", "companyName", "email", "phone", "proprietorName", "website"]);
    const bank = buildSectionUpdate("banking", SECTION_SCHEMAS.banking.parse({ bankName: "HDFC", accountName: "A", accountNumber: "123456789", ifscCode: "hdfc0001234" }), null);
    expect(bank).toEqual({ bankName: "HDFC", accountName: "A", ifscCode: "HDFC0001234" });
    expect(bank.accountNumber).toBeUndefined();
  });

  it("shop slugs are normalised and short ones are dropped", () => {
    expect(normalizeShopSlug("  My Cool_Shop! ")).toBe("my-coolshop");
    expect(normalizeShopSlug("ab")).toBeNull();
    expect(normalizeShopSlug("--x--y--")).toBe("x-y");
  });

  it("lists only the fields that really changed for the audit log", () => {
    expect(changedFields({ companyName: "A", phone: null, invoiceTermsDays: 7 }, { companyName: "A", phone: "123", invoiceTermsDays: 7 })).toEqual(["phone"]);
  });
});

describe("settings map", () => {
  it("every old anchor lands on a real section and every nav entry has a route", () => {
    for (const s of Object.values(HASH_TO_SECTION)) expect(isSectionKey(s)).toBe(true);
    for (const n of NAV) expect(n.href.startsWith("/settings")).toBe(true);
    expect(new Set(NAV.map((n) => n.key)).size).toBe(NAV.length);
    expect(activeKey("/settings", "tax")).toBe("tax");
    expect(activeKey("/settings", "nonsense")).toBe("overview");
    expect(activeKey("/settings/invoice-designs", null)).toBe("invoicing");
    expect(activeKey("/settings/team", null)).toBe("team");
  });

  it("the module list covers real modules once, and leaves out the shop (it has its own section)", () => {
    const keys = MODULE_CATALOG.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect((MODULE_KEYS as readonly string[]).includes(k)).toBe(true);
    expect(keys).toContain("TAX_ADVANCED");
    expect(keys).not.toContain("SHOP");
  });
});
