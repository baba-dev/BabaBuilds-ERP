// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseServiceForm, sameServiceName, MAX_SERVICE_PRICE } from "@/lib/services/validation";
import { filterServices, sortServices, usageOf, type ServiceItem } from "@/app/(dashboard)/services/_components/service-types";
import { GenerateInvoiceSchema } from "@/lib/invoice/generate-schema";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

describe("service form validation", () => {
  it("accepts a valid service and normalises empty optionals to null", () => {
    const result = parseServiceForm(form({ name: "  SEO Audit ", defaultPrice: "2500.50", description: "", nicCodeId: "", sacCodeId: "sac_1" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ name: "SEO Audit", defaultPrice: 2500.5, description: null, nicCodeId: null, sacCodeId: "sac_1" });
    }
  });

  it.each([
    ["missing name", { name: "", defaultPrice: "10" }],
    ["negative price", { name: "X", defaultPrice: "-1" }],
    ["non-numeric price", { name: "X", defaultPrice: "abc" }],
    ["absurd price", { name: "X", defaultPrice: String(MAX_SERVICE_PRICE + 1) }],
    ["name too long", { name: "x".repeat(121), defaultPrice: "1" }],
    ["short description too long", { name: "X", defaultPrice: "1", description: "d".repeat(201) }],
  ])("rejects %s", (_label, fields) => {
    expect(parseServiceForm(form(fields)).success).toBe(false);
  });

  it("treats names case-insensitively for the duplicate guard", () => {
    expect(sameServiceName("Monthly SEO", " monthly seo ")).toBe(true);
    expect(sameServiceName("Monthly SEO", "Monthly SEO Plus")).toBe(false);
  });
});

describe("catalogue sorting and search", () => {
  const svc = (id: string, name: string, price: number, usage = { proposals: 0, retainers: 0 }, sac?: string): ServiceItem => ({
    id, name, defaultPrice: price, usage, sacCode: sac ? { code: sac, description: "", igstRate: 18 } : null,
  });
  const list = [svc("a", "Brand design", 500, { proposals: 1, retainers: 0 }), svc("b", "Audit", 900, { proposals: 3, retainers: 2 }, "998313"), svc("c", "Zen retainer", 100)];

  it("sorts by name, price and usage", () => {
    expect(sortServices(list, "name").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(sortServices(list, "priceDesc").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(sortServices(list, "priceAsc").map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(sortServices(list, "used").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(usageOf(list[1])).toBe(5);
  });

  it("searches name, description and tax codes, ignoring case", () => {
    expect(filterServices(list, "DESIGN").map((s) => s.id)).toEqual(["a"]);
    expect(filterServices(list, "9983").map((s) => s.id)).toEqual(["b"]);
    expect(filterServices(list, "  ")).toHaveLength(3);
  });
});

describe("POST /api/generate request schema", () => {
  const base = { clientId: "c1", billingMonth: "November 2026" };

  it("accepts the payload the invoice form actually sends (null productId, string tax class)", () => {
    const parsed = GenerateInvoiceSchema.safeParse({
      ...base,
      services: [
        { title: "Audit", amount: "45000", quantity: 1, unitPrice: 45000, productId: null, sac: "998313", sacCode: null },
        { title: "Design", amount: 100, quantity: 2, unitPrice: 50, productId: "p1", sac: { code: "9983", igstRate: 18 } },
      ],
      currency: "usd",
      exchangeRate: "83.5",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.currency).toBe("USD");
      expect(parsed.data.exchangeRate).toBe(83.5);
    }
  });

  it("still rejects bad input", () => {
    expect(GenerateInvoiceSchema.safeParse({ ...base, services: [] }).success).toBe(false);
    expect(GenerateInvoiceSchema.safeParse({ ...base, services: [{ title: "", amount: 5 }] }).success).toBe(false);
    expect(GenerateInvoiceSchema.safeParse({ ...base, services: [{ title: "x", amount: -5 }] }).success).toBe(false);
    expect(GenerateInvoiceSchema.safeParse({ ...base, currency: "usdx", services: [{ title: "x", amount: 5 }] }).success).toBe(false);
    expect(GenerateInvoiceSchema.safeParse({ ...base, exchangeRate: 0, services: [{ title: "x", amount: 5 }] }).success).toBe(false);
  });
});
