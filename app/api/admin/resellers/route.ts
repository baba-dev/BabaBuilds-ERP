import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { Prisma, ResellerStatus } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function GET() {
  try {
    await verifySuperAdmin();

    const [resellers, totalLeads, wonLeads, commissions] = await Promise.all([
      prisma.resellerAccount.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          coupons: { select: { id: true, code: true, usedCount: true, isActive: true, createdAt: true } },
          leads: { select: { stage: true } },
        },
      }),
      prisma.resellerLead.count(),
      prisma.resellerLead.count({ where: { stage: "WON" } }),
      prisma.resellerCommission.aggregate({
        _sum: { commissionAmount: true, dealAmount: true },
      }),
    ]);

    const payload = resellers.map((reseller) => {
      const leadCount = reseller.leads.length;
      const wonCount = reseller.leads.filter((lead) => lead.stage === "WON").length;
      const activeCoupons = reseller.coupons.filter((coupon) => coupon.isActive).length;
      const couponUsage = reseller.coupons.reduce((acc, coupon) => acc + coupon.usedCount, 0);
      const conversionRate =
        leadCount > 0
          ? Number(((wonCount / leadCount) * 100).toFixed(2))
          : 0;

      return {
        id: reseller.id,
        name: reseller.name,
        email: reseller.email,
        status: reseller.status,
        payoutTerms: reseller.payoutTerms,
        defaultCustomerDiscount: toNumber(reseller.defaultCustomerDiscount),
        defaultCommissionPercent: toNumber(reseller.defaultCommissionPercent),
        leadCount,
        conversionRate,
        activeCoupons,
        couponUsage,
        latestCoupon: reseller.coupons[0]?.code ?? null,
        createdAt: reseller.createdAt,
      };
    });

    return NextResponse.json({
      items: payload,
      summary: {
        resellerCount: payload.length,
        totalLeads,
        wonLeads,
        overallConversionRate: totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0,
        totalCommissionAmount: toNumber(commissions._sum.commissionAmount),
        totalDealAmount: toNumber(commissions._sum.dealAmount),
      },
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to fetch reseller accounts");
  }
}

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const payoutTerms = typeof body?.payoutTerms === "string" && body.payoutTerms.trim()
      ? body.payoutTerms.trim()
      : "Net 30";
    const customerDiscount = Number(body?.defaultCustomerDiscount ?? 25);
    const commissionPercent = Number(body?.defaultCommissionPercent ?? 12.5);

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }

    const reseller = await prisma.resellerAccount.create({
      data: {
        name,
        email,
        payoutTerms,
        defaultCustomerDiscount: customerDiscount,
        defaultCommissionPercent: commissionPercent,
      },
    });

    return NextResponse.json({ reseller }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to create reseller");
  }
}

export async function PATCH(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();

    const resellerId = typeof body?.resellerId === "string" ? body.resellerId : null;
    if (!resellerId) {
      return NextResponse.json({ error: "resellerId is required" }, { status: 400 });
    }

    const data: {
      status?: ResellerStatus;
      payoutTerms?: string;
      defaultCustomerDiscount?: number;
      defaultCommissionPercent?: number;
    } = {};

    if (typeof body?.status === "string" && ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(body.status)) {
      data.status = body.status as ResellerStatus;
    }
    if (typeof body?.payoutTerms === "string" && body.payoutTerms.trim()) {
      data.payoutTerms = body.payoutTerms.trim();
    }
    if (body?.defaultCustomerDiscount != null) {
      data.defaultCustomerDiscount = Number(body.defaultCustomerDiscount);
    }
    if (body?.defaultCommissionPercent != null) {
      data.defaultCommissionPercent = Number(body.defaultCommissionPercent);
    }

    const reseller = await prisma.resellerAccount.update({
      where: { id: resellerId },
      data,
    });

    return NextResponse.json({ reseller });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update reseller");
  }
}
