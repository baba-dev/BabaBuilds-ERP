import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import { getAuthFailureMetrics } from "@/lib/auth-observability";
import { getProtocolLaunchMetrics } from "@/lib/protocol-observability";
import { decimalToNumber, toDecimal } from "@/lib/money";
import { getMonthlyPriceForInterval, getPricingRegionFromCountry } from "@/lib/pricing";

export async function GET() {
  try {
    await verifySuperAdmin();

    // Fetch aggregates
    const totalWorkspaces = await prisma.workspace.count();
    // 2a. Real MRR calculation based on current pricing constants
    const workspaces = await prisma.workspace.findMany({
      where: { subscriptionStatus: { in: ["PRO", "TEAM"] } },
      select: { planInterval: true, countryCode: true }
    });

    const mrr = workspaces.reduce(
      (sum, ws) => sum + getMonthlyPriceForInterval(ws.planInterval, getPricingRegionFromCountry(ws.countryCode)),
      0,
    );
    
    const totalInvoices = await prisma.invoice.count();
    const totalClients = await prisma.client.count();
    const authFailures = getAuthFailureMetrics();
    const protocolLaunches = getProtocolLaunchMetrics();

    // Total gross volume across platform
    const invoices = await prisma.invoice.findMany({ select: { totalAmount: true } });
    const gmv = decimalToNumber(invoices.reduce((sum, inv) => sum.plus(toDecimal(inv.totalAmount)), toDecimal(0)));

    return NextResponse.json({
      mrr: mrr,
      activeSubscriptions: workspaces.length,
      totalWorkspaces,
      platformGmv: gmv,
      totalDocuments: totalInvoices + totalClients,
      churnRate: totalWorkspaces > 0 ? ((totalWorkspaces - workspaces.length) / totalWorkspaces * 10).toFixed(1) + "%" : "0%",
      authFailureCount: authFailures.reduce((sum, row) => sum + row.count, 0),
      authFailureByReason: authFailures,
      protocolLaunchCount: protocolLaunches.reduce((sum, row) => sum + row.count, 0),
      protocolLaunchSuccessCount: protocolLaunches
        .filter((row) => row.outcome === "success")
        .reduce((sum, row) => sum + row.count, 0),
      protocolLaunchFailureCount: protocolLaunches
        .filter((row) => row.outcome === "failure")
        .reduce((sum, row) => sum + row.count, 0),
      protocolLaunchByOutcome: protocolLaunches,
    });

  } catch (error) {
    return handleAdminApiError(error, "Server Error");
  }
}
