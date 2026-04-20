import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../../authz";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function POST() {
  try {
    await verifySuperAdmin();

    const leads = await prisma.resellerLead.findMany({
      where: {
        stage: { in: ["QUALIFIED", "WON"] },
      },
      include: {
        coupon: true,
        reseller: true,
        workspace: {
          include: {
            billingTransactions: {
              where: { status: "PAID" },
              orderBy: { transactionDate: "asc" },
            },
          },
        },
      },
    });

    let created = 0;

    for (const lead of leads) {
      const commissionPercent = toNumber(
        lead.coupon?.commissionPercent ?? lead.reseller.defaultCommissionPercent,
      );

      for (const tx of lead.workspace.billingTransactions) {
        const already = await prisma.resellerCommission.findFirst({
          where: { billingTransactionId: tx.id },
          select: { id: true },
        });
        if (already) continue;

        const dealAmount = toNumber(tx.amount);
        const commissionAmount = Number(((dealAmount * commissionPercent) / 100).toFixed(2));

        await prisma.resellerCommission.create({
          data: {
            resellerId: lead.resellerId,
            leadId: lead.id,
            billingTransactionId: tx.id,
            dealAmount,
            commissionPercent,
            commissionAmount,
            status: "APPROVED",
            notes: "Auto-synced from paid billing transaction",
          },
        });
        created += 1;
      }

      if (lead.workspace.billingTransactions.length > 0 && lead.stage !== "WON") {
        await prisma.resellerLead.update({
          where: { id: lead.id },
          data: { stage: "WON", conversionAt: lead.conversionAt ?? new Date() },
        });
      }
    }

    return NextResponse.json({ created });
  } catch (error) {
    return handleAdminApiError(error, "Failed to sync reseller commissions");
  }
}
