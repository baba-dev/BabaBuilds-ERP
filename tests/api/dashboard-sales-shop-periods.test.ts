import { expect, test } from "vitest";

import { describeKpiPeriod, getFyDateRange } from "@/app/api/dashboard/sales-shop-kpi-periods";

type MockOrder = {
  createdAt: Date;
  status: "PAID" | "PENDING" | "FAILED";
  amount: number;
};

const inRange = (date: Date, range: { start: Date; endExclusive: Date }) => date >= range.start && date < range.endExclusive;

test("FY period metadata is explicit and stable", () => {
  const now = new Date("2026-02-10T00:00:00.000Z");
  const fy = "25-26";
  const fyRange = getFyDateRange(fy);
  expect(fyRange).not.toBeNull();

  const period = describeKpiPeriod({ type: "FY", now, fy, fyRange });
  expect(period).toEqual({
    type: "FY",
    period: "FY_25_26",
    start: "2025-04-01T00:00:00.000Z",
    endExclusive: "2026-04-01T00:00:00.000Z",
  });
});

test("changing FY changes service-order KPI aggregates", () => {
  const orders: MockOrder[] = [
    { createdAt: new Date("2024-06-05T00:00:00.000Z"), status: "PAID", amount: 1200 },
    { createdAt: new Date("2024-12-10T00:00:00.000Z"), status: "PENDING", amount: 800 },
    { createdAt: new Date("2025-05-12T00:00:00.000Z"), status: "PAID", amount: 2200 },
    { createdAt: new Date("2025-11-21T00:00:00.000Z"), status: "FAILED", amount: 400 },
  ];

  const fy24_25 = getFyDateRange("24-25");
  const fy25_26 = getFyDateRange("25-26");
  expect(fy24_25 && fy25_26).toBeTruthy();
  if (!fy24_25 || !fy25_26) return;

  const fy24_25Orders = orders.filter((row) => inRange(row.createdAt, fy24_25));
  const fy25_26Orders = orders.filter((row) => inRange(row.createdAt, fy25_26));

  const fy24_25Paid = fy24_25Orders.filter((row) => row.status === "PAID").length;
  const fy25_26Paid = fy25_26Orders.filter((row) => row.status === "PAID").length;
  const fy24_25Revenue = fy24_25Orders.filter((row) => row.status === "PAID").reduce((sum, row) => sum + row.amount, 0);
  const fy25_26Revenue = fy25_26Orders.filter((row) => row.status === "PAID").reduce((sum, row) => sum + row.amount, 0);

  expect(fy24_25Orders).toHaveLength(2);
  expect(fy25_26Orders).toHaveLength(2);
  expect(fy24_25Paid).toBe(1);
  expect(fy25_26Paid).toBe(1);
  expect(fy24_25Revenue).toBe(1200);
  expect(fy25_26Revenue).toBe(2200);
});

test("rolling 30-day metadata returns bounded window", () => {
  const now = new Date("2026-04-13T00:00:00.000Z");
  const period = describeKpiPeriod({ type: "ROLLING_30D", now, fy: "25-26", fyRange: getFyDateRange("25-26") });

  expect(period.type).toBe("ROLLING_30D");
  expect(period.period).toBe("ROLLING_30D");
  expect(period.start).toBe("2026-03-14T00:00:00.000Z");
  expect(period.endExclusive).toBe("2026-04-13T00:00:00.000Z");
});
