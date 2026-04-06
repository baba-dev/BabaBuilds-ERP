import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "@/api/admin/authz";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await verifySuperAdmin();

    // Fetch aggregates
    const totalWorkspaces = await prisma.workspace.count();
    // 2a. Real MRR calculation based on actual billing tiers
    const workspaces = await prisma.workspace.findMany({
      where: { subscriptionStatus: 'PRO' },
      select: { planInterval: true }
    });

    const mrr = workspaces.reduce((sum, ws) => {
      if (ws.planInterval === "YEARLY") return sum + (2300 / 12);
      if (ws.planInterval === "QUARTERLY") return sum + (550 / 3);
      return sum + 200; // Default to MONTHLY logic
    }, 0);
    
    const totalInvoices = await prisma.invoice.count();
    const totalClients = await prisma.client.count();

    // Total gross volume across platform
    const invoices = await prisma.invoice.findMany({ select: { totalAmount: true } });
    const gmv = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

    return NextResponse.json({
      mrr: mrr,
      activeSubscriptions: workspaces.length,
      totalWorkspaces,
      platformGmv: gmv,
      totalDocuments: totalInvoices + totalClients,
      churnRate: totalWorkspaces > 0 ? ((totalWorkspaces - workspaces.length) / totalWorkspaces * 10).toFixed(1) + "%" : "0%"
    });

  } catch (error) {
    return handleAdminApiError(error, "Server Error");
  }
}
