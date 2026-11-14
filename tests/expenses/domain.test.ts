import { describe, expect, it } from "vitest";
import { normalizeExpenseCore, parseAmount } from "@/lib/expenses/validate";
import { previousRange, resolvePeriod } from "@/lib/expenses/period";

const NOW = new Date("2026-11-09T10:00:00Z");

describe("normalizeExpenseCore", () => {
  it("accepts a normal expense and tidies it", () => {
    const r = normalizeExpenseCore({ vendor: "  AWS   India ", category: "Hosting & Cloud", amount: "1,200.505", date: "2026-11-01", description: " server  bill " }, { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ vendor: "AWS India", category: "Hosting & Cloud", amount: 1200.51, description: "server bill" });
  });
  it("rejects blank vendor, zero or text amounts, bad and far-future dates", () => {
    const r = normalizeExpenseCore({ vendor: " ", amount: "0", date: "not a date", category: "" }, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields.map((f) => `${f.field}:${f.code}`).sort()).toEqual(["amount:AMOUNT", "date:DATE", "vendor:REQUIRED"]);
    const future = normalizeExpenseCore({ vendor: "A", amount: 5, date: "2027-06-01" }, { now: NOW });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.fields[0].code).toBe("DATE_FUTURE");
  });
  it("defaults the category to Other and only checks sent keys when partial", () => {
    const full = normalizeExpenseCore({ vendor: "A", amount: 5, date: "2026-11-01" }, { now: NOW });
    expect(full.ok && full.data.category).toBe("Other");
    const partial = normalizeExpenseCore({ amount: "10" }, { partial: true, now: NOW });
    expect(partial).toEqual({ ok: true, data: { amount: 10 } });
    expect(normalizeExpenseCore({ category: "" }, { partial: true }).ok).toBe(false);
  });
  it("parses typed amounts strictly", () => {
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("12abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
  });
});

describe("resolvePeriod", () => {
  it("uses an April financial year for India and a calendar year elsewhere", () => {
    const inFy = resolvePeriod("this_fy", "IN", NOW);
    expect(inFy.from?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(inFy.to?.toISOString()).toBe("2027-04-01T00:00:00.000Z");
    const us = resolvePeriod("this_fy", "US", NOW);
    expect(us.from?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    const early = resolvePeriod("this_fy", "IN", new Date("2026-02-10T00:00:00Z"));
    expect(early.from?.toISOString()).toBe("2025-04-01T00:00:00.000Z");
  });
  it("handles months and the span before a range", () => {
    const last = resolvePeriod("last_month", "IN", new Date("2026-01-15T00:00:00Z"));
    expect(last.from?.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(last.to?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(previousRange(resolvePeriod("this_month", "IN", NOW))?.to?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(previousRange(resolvePeriod("all", "IN", NOW))).toBeNull();
  });
});
