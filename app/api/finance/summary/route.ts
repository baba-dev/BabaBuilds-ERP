import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [invoiceAggregate, expenseAggregate] = await Promise.all([
      prisma.invoice.aggregate({
        where: { workspaceId, status: { not: "VOID" } },
        _sum: { totalAmount: true },
      }),
      prisma.expense.aggregate({
        where: { workspaceId },
        _sum: { amount: true },
      }),
    ]);

    const totalRevenue = toNumber(invoiceAggregate._sum.totalAmount);
    const totalExpenses = toNumber(expenseAggregate._sum.amount);
    const presumptiveExpenses = totalRevenue * 0.5;
    const actualProfit = totalRevenue - totalExpenses;
    const taxFreeAlpha = Math.max(0, presumptiveExpenses - totalExpenses);
    const burnPercentage =
      totalRevenue > 0 && presumptiveExpenses > 0 ? (totalExpenses / presumptiveExpenses) * 100 : 0;

    return NextResponse.json({
      data: {
        totalRevenue,
        totalExpenses,
        presumptiveExpenses,
        actualProfit,
        taxFreeAlpha,
        burnPercentage,
      },
    });
  } catch (error) {
    console.error("API Error fetching finance summary:", error);
    return NextResponse.json({ error: "Failed to fetch finance summary" }, { status: 500 });
  }
}
