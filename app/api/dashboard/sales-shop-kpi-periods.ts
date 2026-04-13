export type KpiPeriodType = "FY" | "ROLLING_30D" | "ALL_TIME";

export type KpiPeriodMeta = {
  type: KpiPeriodType;
  period: string;
  start: string | null;
  endExclusive: string | null;
};

export const getFyDateRange = (fy: string): { start: Date; endExclusive: Date } | null => {
  const match = fy.match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const startYear = 2000 + Number(match[1]);
  const endYear = 2000 + Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear !== startYear + 1) return null;
  return {
    start: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    endExclusive: new Date(Date.UTC(endYear, 3, 1, 0, 0, 0)),
  };
};

export const describeKpiPeriod = ({
  type,
  now,
  fy,
  fyRange,
}: {
  type: KpiPeriodType;
  now: Date;
  fy: string;
  fyRange: { start: Date; endExclusive: Date } | null;
}): KpiPeriodMeta => {
  if (type === "FY") {
    return {
      type,
      period: `FY_${fy.replace("-", "_")}`,
      start: fyRange?.start.toISOString() ?? null,
      endExclusive: fyRange?.endExclusive.toISOString() ?? null,
    };
  }

  if (type === "ROLLING_30D") {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return {
      type,
      period: "ROLLING_30D",
      start: start.toISOString(),
      endExclusive: now.toISOString(),
    };
  }

  return {
    type,
    period: "ALL_TIME",
    start: null,
    endExclusive: null,
  };
};
