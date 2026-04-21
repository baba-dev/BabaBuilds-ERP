import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../authz";

function createCouponCode(seed: string) {
  const base = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
    .padEnd(6, "X");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${base}-${rand}`;
}

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function GET() {
  try {
    await verifySuperAdmin();

    const coupons = await prisma.resellerCoupon.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        reseller: {
          select: { id: true, name: true, email: true },
        },
        leads: {
          select: {
            id: true,
            stage: true,
            conversionAt: true,
            createdAt: true,
            workspace: {
              select: {
                id: true,
                name: true,
                billingTransactions: {
                  where: { status: "PAID" },
                  select: { id: true, amount: true, transactionDate: true },
                },
              },
            },
          },
        },
      },
    });

    const items = coupons.map((coupon) => {
      const leads = coupon.leads.length;
      const won = coupon.leads.filter((lead) => lead.stage === "WON").length;
      const conversionRate = leads > 0 ? Number(((won / leads) * 100).toFixed(2)) : 0;
      const revenue = coupon.leads.reduce((sum, lead) => {
        const wsRevenue = lead.workspace.billingTransactions.reduce(
          (acc, tx) => acc + toNumber(tx.amount),
          0,
        );
        return sum + wsRevenue;
      }, 0);
      const renewals = coupon.leads.reduce((sum, lead) => {
        const txCount = lead.workspace.billingTransactions.length;
        return sum + Math.max(0, txCount - 1);
      }, 0);

      return {
        id: coupon.id,
        resellerId: coupon.resellerId,
        resellerName: coupon.reseller.name,
        code: coupon.code,
        usedCount: coupon.usedCount,
        maxUses: coupon.maxUses,
        isActive: coupon.isActive,
        discountValue: toNumber(coupon.discountValue),
        commissionPercent: toNumber(coupon.commissionPercent),
        conversionRate,
        revenue,
        renewals,
        leadDetails: coupon.leads.map((lead) => ({
          id: lead.id,
          stage: lead.stage,
          appliedAt: lead.createdAt,
          conversionAt: lead.conversionAt,
          workspaceId: lead.workspace.id,
          workspaceName: lead.workspace.name,
          paidTransactions: lead.workspace.billingTransactions.length,
          revenue: lead.workspace.billingTransactions.reduce(
            (acc, tx) => acc + toNumber(tx.amount),
            0,
          ),
        })),
        createdAt: coupon.createdAt,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    return handleAdminApiError(error, "Failed to fetch reseller coupons");
  }
}

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();

    const resellerId = typeof body?.resellerId === "string" ? body.resellerId : null;
    if (!resellerId) {
      return NextResponse.json({ error: "resellerId is required" }, { status: 400 });
    }

    const reseller = await prisma.resellerAccount.findUnique({
      where: { id: resellerId },
      select: {
        id: true,
        name: true,
        defaultCustomerDiscount: true,
        defaultCommissionPercent: true,
      },
    });

    if (!reseller) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    const coupon = await prisma.resellerCoupon.create({
      data: {
        resellerId: reseller.id,
        code: createCouponCode(reseller.name),
        discountType: "PERCENT",
        discountValue: Number(body?.discountValue ?? reseller.defaultCustomerDiscount),
        commissionPercent: Number(body?.commissionPercent ?? reseller.defaultCommissionPercent),
        firstPurchaseOnly: body?.firstPurchaseOnly !== false,
        firstYearOnly: body?.firstYearOnly !== false,
        maxUses: typeof body?.maxUses === "number" ? body.maxUses : null,
      },
    });

    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to create coupon");
  }
}

export async function PATCH(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();

    const couponId = typeof body?.couponId === "string" ? body.couponId : null;
    if (!couponId) {
      return NextResponse.json({ error: "couponId is required" }, { status: 400 });
    }

    const coupon = await prisma.resellerCoupon.update({
      where: { id: couponId },
      data: {
        isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
        discountValue: body?.discountValue != null ? Number(body.discountValue) : undefined,
        commissionPercent: body?.commissionPercent != null ? Number(body.commissionPercent) : undefined,
        maxUses: typeof body?.maxUses === "number" ? body.maxUses : undefined,
      },
    });

    return NextResponse.json({ coupon });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update coupon");
  }
}
