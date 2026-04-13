import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";

export type MonthlyChartRowInput = { date: Date; value: Prisma.Decimal | number | string | null | undefined };
export type MonthlyChartBucket = { monthId: string; label: string; revenue: Prisma.Decimal; expenses: Prisma.Decimal; mrr: Prisma.Decimal };

export const DEFAULT_BUCKET_TIME_ZONE = "Asia/Kolkata";

const toTimeZoneParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error(`Unable to resolve monthly bucket key in timezone: ${timeZone}`);
  }

  return { year, month };
};

export const resolveMonthlyBucketTimeZone = (candidateTimeZone: string | null | undefined) => {
  if (!candidateTimeZone) return DEFAULT_BUCKET_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidateTimeZone }).format(new Date());
    return candidateTimeZone;
  } catch {
    return DEFAULT_BUCKET_TIME_ZONE;
  }
};

const monthIdKey = (date: Date, timeZone: string) => {
  const { year, month } = toTimeZoneParts(date, timeZone);
  return `${year}-${month}`;
};

const monthLabelFromId = (monthId: string) => {
  const [year, month] = monthId.split("-");
  const safeDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return safeDate.toLocaleDateString("en-US", { month: "short" });
};

export const buildMonthlyChartBuckets = ({
  revenueRows,
  expenseRows,
  mrrRows,
  bucketTimeZone,
}: {
  revenueRows: MonthlyChartRowInput[];
  expenseRows: MonthlyChartRowInput[];
  mrrRows: MonthlyChartRowInput[];
  bucketTimeZone: string;
}): MonthlyChartBucket[] => {
  const monthly: Record<string, { revenue: Prisma.Decimal; expenses: Prisma.Decimal; mrr: Prisma.Decimal }> = {};
  const ensureMonth = (monthId: string) => {
    if (!monthly[monthId]) {
      monthly[monthId] = { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), mrr: new Prisma.Decimal(0) };
    }
    return monthly[monthId];
  };

  revenueRows.forEach((row) => {
    const month = monthIdKey(row.date, bucketTimeZone);
    const bucket = ensureMonth(month);
    bucket.revenue = bucket.revenue.plus(toDecimal(row.value));
  });

  expenseRows.forEach((row) => {
    const month = monthIdKey(row.date, bucketTimeZone);
    const bucket = ensureMonth(month);
    bucket.expenses = bucket.expenses.plus(toDecimal(row.value));
  });

  mrrRows.forEach((row) => {
    const month = monthIdKey(row.date, bucketTimeZone);
    const bucket = ensureMonth(month);
    bucket.mrr = bucket.mrr.plus(toDecimal(row.value));
  });

  return Object.keys(monthly)
    .sort((a, b) => a.localeCompare(b))
    .map((monthId) => ({
      monthId,
      label: monthLabelFromId(monthId),
      revenue: monthly[monthId].revenue,
      expenses: monthly[monthId].expenses,
      mrr: monthly[monthId].mrr,
    }));
};
