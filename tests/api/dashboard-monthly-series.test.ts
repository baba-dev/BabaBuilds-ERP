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
    bucketTimeZone: "Asia/Kolkata",
  });

  expect(series.map((row) => row.monthId)).toEqual(["2026-04", "2026-05", "2026-06"]);
  expect(series.map((row) => row.label)).toEqual(["Apr", "May", "Jun"]);
});

test("buildMonthlyChartBuckets uses configured timezone for month boundaries", () => {
  const boundaryUtc = new Date("2026-05-01T06:30:00.000Z"); // 23:30 on Apr 30 in America/Los_Angeles

  const utcSeries = buildMonthlyChartBuckets({
    revenueRows: [{ date: boundaryUtc, value: 100 }],
    expenseRows: [],
    mrrRows: [],
    bucketTimeZone: "UTC",
  });
  const localSeries = buildMonthlyChartBuckets({
    revenueRows: [{ date: boundaryUtc, value: 100 }],
    expenseRows: [],
    mrrRows: [],
    bucketTimeZone: "America/Los_Angeles",
  });

  expect(utcSeries[0]?.monthId).toBe("2026-05");
  expect(localSeries[0]?.monthId).toBe("2026-04");
});
