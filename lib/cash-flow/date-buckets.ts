import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import type { ForecastBucket, CashForecastHorizonType } from "./types";

const dayEndExclusive = (day: Date) => addDays(startOfDay(day), 1);

export function buildForecastBuckets(args: { horizonType: CashForecastHorizonType; startDate: Date }): ForecastBucket[] {
  const { horizonType, startDate } = args;
  if (horizonType === "DAILY_30") {
    const start = startOfDay(startDate);
    return Array.from({ length: 30 }).map((_, idx) => {
      const day = addDays(start, idx);
      return {
        periodStart: startOfDay(day),
        periodEnd: dayEndExclusive(day),
        bucketLabel: format(day, "dd MMM"),
      };
    });
  }

  if (horizonType === "WEEKLY_13") {
    const start = startOfWeek(startDate, { weekStartsOn: 1 });
    return Array.from({ length: 13 }).map((_, idx) => {
      const week = addWeeks(start, idx);
      const periodStart = startOfWeek(week, { weekStartsOn: 1 });
      const periodEnd = addDays(endOfWeek(week, { weekStartsOn: 1 }), 1);
      return {
        periodStart,
        periodEnd,
        bucketLabel: `${format(periodStart, "dd MMM")} – ${format(periodEnd, "dd MMM")}`,
      };
    });
  }

  // MONTHLY_12
  const start = startOfMonth(startDate);
  return Array.from({ length: 12 }).map((_, idx) => {
    const month = addMonths(start, idx);
    const periodStart = startOfMonth(month);
    const periodEnd = addDays(endOfMonth(month), 1);
    return {
      periodStart,
      periodEnd,
      bucketLabel: format(month, "MMM yyyy"),
    };
  });
}

