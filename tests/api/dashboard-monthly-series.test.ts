import { expect, test } from "vitest";

import { buildMonthlyChartBuckets, buildRetainerMrrRows } from "@/app/api/dashboard/monthly-series";

test("buildMonthlyChartBuckets keeps chronological order across mixed insertion sources", () => {
  const now = new Date("2026-05-15T10:00:00.000Z");

  const series = buildMonthlyChartBuckets({
    revenueRows: [
      { date: new Date("2026-06-02T00:00:00.000Z"), value: 200 },
      { date: new Date("2026-04-20T00:00:00.000Z"), value: 100 },
    ],
    expenseRows: [
      { date: new Date("2026-05-11T00:00:00.000Z"), value: 40 },
      { date: new Date("2026-04-04T00:00:00.000Z"), value: 10 },
    ],
    mrrRows: [{ date: now, value: 25 }],
  });

  expect(series.map((row) => row.monthId)).toEqual(["2026-04", "2026-05", "2026-06"]);
  expect(series.map((row) => row.label)).toEqual(["Apr", "May", "Jun"]);
});

test("buildRetainerMrrRows uses each retainer billing date so monthly buckets include distinct months", () => {
  const mrrRows = buildRetainerMrrRows([
    { nextBillingDate: new Date("2026-04-10T00:00:00.000Z"), amount: 1500 },
    { nextBillingDate: new Date("2026-05-10T00:00:00.000Z"), amount: 1800 },
  ]);

  const series = buildMonthlyChartBuckets({
    revenueRows: [],
    expenseRows: [],
    mrrRows,
  });

  expect(series.map((row) => row.monthId)).toEqual(["2026-04", "2026-05"]);
  expect(series.map((row) => Number(row.mrr))).toEqual([1500, 1800]);
});

test("buildRetainerMrrRows respects FY range boundaries for retainers crossing years", () => {
  const fyRange = {
    start: new Date("2025-04-01T00:00:00.000Z"),
    endExclusive: new Date("2026-04-01T00:00:00.000Z"),
  };

  const mrrRows = buildRetainerMrrRows(
    [
      { nextBillingDate: new Date("2025-03-25T00:00:00.000Z"), amount: 900 },
      { nextBillingDate: new Date("2025-04-01T00:00:00.000Z"), amount: 1000 },
      { nextBillingDate: new Date("2026-02-12T00:00:00.000Z"), amount: 1200 },
      { nextBillingDate: new Date("2026-04-01T00:00:00.000Z"), amount: 1300 },
    ],
    fyRange,
  );

  const series = buildMonthlyChartBuckets({
    revenueRows: [],
    expenseRows: [],
    mrrRows,
  });

  expect(series.map((row) => row.monthId)).toEqual(["2025-04", "2026-02"]);
  expect(series.map((row) => Number(row.mrr))).toEqual([1000, 1200]);
});
