import { describe, expect, it } from "vitest";
import { advanceBillingDate, isFinished, monthlyEquivalent, upcomingDates } from "@/lib/retainers/schedule";
import { canHardDelete, canTransition, getDisplayStatus, isDue } from "@/lib/retainers/status";
import { buildBaseWhere, buildListWhere, parseRetainerListQuery } from "@/lib/retainers/query";
import { retainerInputSchema, statusChangeSchema } from "@/lib/retainers/validation";
import { amountsOfItems } from "@/lib/retainers/pricing";

const d = (s: string) => new Date(`${s}T10:00:00`);

describe("billing schedule", () => {
  it("keeps month-end retainers on month-end and never lands on a weekend", () => {
    expect(advanceBillingDate(d("2027-01-31"), "MONTHLY").getDate()).toBe(26); // Feb 28 2027 is a Sunday -> Friday 26th
    expect(advanceBillingDate(d("2027-03-01"), "QUARTERLY").getMonth()).toBe(5);
    expect([0, 6]).not.toContain(advanceBillingDate(d("2027-02-05"), "MONTHLY").getDay());
  });

  it("stops at the end date or the cycle limit", () => {
    const base = { endDate: null, maxCycles: 3, cyclesBilled: 0 };
    expect(upcomingDates(d("2027-04-01"), "MONTHLY", base, 10)).toHaveLength(3);
    expect(upcomingDates(d("2027-04-01"), "MONTHLY", { ...base, cyclesBilled: 2 }, 10)).toHaveLength(1);
    expect(upcomingDates(d("2027-04-01"), "MONTHLY", { endDate: d("2027-06-15"), maxCycles: null, cyclesBilled: 0 }, 10)).toHaveLength(3);
    expect(isFinished(d("2027-07-01"), { endDate: d("2027-06-15"), maxCycles: null, cyclesBilled: 0 })).toBe(true);
    expect(isFinished(d("2027-04-01"), { endDate: null, maxCycles: 2, cyclesBilled: 2 })).toBe(true);
  });

  it("normalises every frequency to a monthly figure", () => {
    expect(monthlyEquivalent(1200, "MONTHLY")).toBe(1200);
    expect(monthlyEquivalent(3000, "QUARTERLY")).toBe(1000);
    expect(monthlyEquivalent(12000, "ANNUALLY")).toBe(1000);
  });
});

describe("lifecycle rules", () => {
  it("only allows pause/resume/cancel from live states", () => {
    expect(canTransition("ACTIVE", "PAUSED")).toBe(true);
    expect(canTransition("PAUSED", "ACTIVE")).toBe(true);
    expect(canTransition("CANCELLED", "ACTIVE")).toBe(false);
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(false);
  });
  it("derives DUE only for active retainers whose date has arrived", () => {
    const now = new Date("2027-04-10T08:00:00Z");
    expect(isDue("ACTIVE", new Date("2027-04-10T00:00:00Z"), now)).toBe(true);
    expect(isDue("PAUSED", new Date("2027-04-01T00:00:00Z"), now)).toBe(false);
    expect(getDisplayStatus("ACTIVE", new Date("2027-05-01T00:00:00Z"), now)).toBe("ACTIVE");
  });
  it("hard-deletes only never-billed retainers", () => {
    expect(canHardDelete(0, 0)).toBe(true);
    expect(canHardDelete(1, 0)).toBe(false);
    expect(canHardDelete(0, 2)).toBe(false);
  });
});

describe("list query and validation", () => {
  it("scopes by workspace, caps the page size and rejects unknown values", () => {
    expect(parseRetainerListQuery(new URLSearchParams("limit=500")).success).toBe(false);
    expect(parseRetainerListQuery(new URLSearchParams("status=NOPE")).success).toBe(false);
    const q = parseRetainerListQuery(new URLSearchParams("status=DUE,ACTIVE&q=seo"));
    if (!q.success) throw new Error("bad");
    expect(buildBaseWhere("ws_1", q.data).workspaceId).toBe("ws_1");
    const text = JSON.stringify(buildListWhere("ws_1", q.data, new Date("2027-04-10T00:00:00Z")));
    expect(text).toContain('"lte"');
    expect(text).toContain('"gt"');
  });
  it("accepts a minimal retainer and rejects bad prices, empty items and unknown statuses", () => {
    const base = { clientId: "c1", name: "SEO", nextBillingDate: "2027-05-01", items: [{ title: "SEO", quantity: 1, unitPrice: 100 }] };
    const ok = retainerInputSchema.safeParse(base);
    expect(ok.success && ok.data.paymentTermsDays).toBe(7);
    expect(retainerInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(retainerInputSchema.safeParse({ ...base, items: [{ title: "x", quantity: 1, unitPrice: -5 }] }).success).toBe(false);
    expect(retainerInputSchema.safeParse({ ...base, nextBillingDate: "soon" }).success).toBe(false);
    expect(statusChangeSchema.safeParse({ status: "COMPLETED" }).success).toBe(false);
  });
  it("sums per-cycle amounts with fractional item tax", () => {
    const a = amountsOfItems([{ quantity: 2, unitPrice: 500, taxRate: 0.18 }, { quantity: 1, unitPrice: 100, taxRate: null }]);
    expect(a.subtotal.toFixed(2)).toBe("1100.00");
    expect(a.tax.toFixed(2)).toBe("180.00");
    expect(a.total.toFixed(2)).toBe("1280.00");
  });
});
