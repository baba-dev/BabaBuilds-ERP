import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";

export type MonthlyChartRowInput = { date: Date; value: Prisma.Decimal | number | string | null | undefined };
export type MonthlyChartBucket = { monthId: string; label: string; revenue: Prisma.Decimal; expenses: Prisma.Decimal; mrr: Prisma.Decimal };
export type DateRange = { start: Date; endExclusive: Date };
export type RetainerMrrInput = {
  nextBillingDate: Date;
  amount: Prisma.Decimal | number | string | null | undefined;
};

const monthIdKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabelFromId = (monthId: string) => {
  const [year, month] = monthId.split("-");
  const safeDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return safeDate.toLocaleDateString("en-US", { month: "short" });
};

export const buildRetainerMrrRows = (retainers: RetainerMrrInput[], range?: DateRange): MonthlyChartRowInput[] =>
  retainers
    .filter((retainer) => {
      if (!range) return true;
      return retainer.nextBillingDate >= range.start && retainer.nextBillingDate < range.endExclusive;
    })
    .map((retainer) => ({
      date: retainer.nextBillingDate,
      value: retainer.amount,
    }));

export const buildMonthlyChartBuckets = ({
  revenueRows,
  expenseRows,
  mrrRows,
}: {
  revenueRows: MonthlyChartRowInput[];
  expenseRows: MonthlyChartRowInput[];
  mrrRows: MonthlyChartRowInput[];
}): MonthlyChartBucket[] => {
  const monthly: Record<string, { revenue: Prisma.Decimal; expenses: Prisma.Decimal; mrr: Prisma.Decimal }> = {};
  const ensureMonth = (monthId: string) => {
    if (!monthly[monthId]) {
      monthly[monthId] = { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), mrr: new Prisma.Decimal(0) };
    }
    return monthly[monthId];
  };

  revenueRows.forEach((row) => {
    const month = monthIdKey(row.date);
    const bucket = ensureMonth(month);
    bucket.revenue = bucket.revenue.plus(toDecimal(row.value));
  });

  expenseRows.forEach((row) => {
    const month = monthIdKey(row.date);
    const bucket = ensureMonth(month);
    bucket.expenses = bucket.expenses.plus(toDecimal(row.value));
  });

  mrrRows.forEach((row) => {
    const month = monthIdKey(row.date);
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
