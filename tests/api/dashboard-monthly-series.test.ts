import { expect, test } from "vitest";

import { buildMonthlyChartBuckets } from "@/app/api/dashboard/monthly-series";

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
