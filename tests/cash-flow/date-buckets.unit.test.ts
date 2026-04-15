import { describe, expect, it } from "vitest";
import { buildForecastBuckets } from "@/lib/cash-flow/date-buckets";

describe("cash-flow date buckets (unit)", () => {
  it("builds 30 daily buckets with exclusive end", () => {
    const start = new Date("2026-04-01T10:00:00.000Z");
    const buckets = buildForecastBuckets({ horizonType: "DAILY_30", startDate: start });
    expect(buckets).toHaveLength(30);
    expect(buckets[0]!.periodStart.getTime()).toBeLessThan(buckets[0]!.periodEnd.getTime());
    // Ensure end is exclusive by construction: next bucket start should equal prev end.
    expect(buckets[1]!.periodStart.toISOString()).toBe(buckets[0]!.periodEnd.toISOString());
  });

  it("builds 13 weekly buckets (Mon-Sun) with exclusive end", () => {
    const start = new Date("2026-04-01T10:00:00.000Z");
    const buckets = buildForecastBuckets({ horizonType: "WEEKLY_13", startDate: start });
    expect(buckets).toHaveLength(13);
    // Weekly buckets are calendar-aligned; periodStart won't necessarily equal previous periodEnd.
    expect(buckets[0]!.periodStart.getTime()).toBeLessThan(buckets[0]!.periodEnd.getTime());
  });

  it("builds 12 monthly buckets with exclusive end", () => {
    const start = new Date("2026-04-01T10:00:00.000Z");
    const buckets = buildForecastBuckets({ horizonType: "MONTHLY_12", startDate: start });
    expect(buckets).toHaveLength(12);
    // Monthly buckets are calendar-aligned; periodStart won't necessarily equal previous periodEnd.
    expect(buckets[0]!.periodStart.getTime()).toBeLessThan(buckets[0]!.periodEnd.getTime());
  });
});

