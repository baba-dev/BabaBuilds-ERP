import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { Prisma } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

/**
 * Compare Razorpay-reported subscription payments vs local BillingTransaction rows for a date range.
 * Query: ?from=ISO&to=ISO (optional, defaults last 30 days)
 */
export async function GET(req: Request) {
  try {
    await verifySuperAdmin();

    const { searchParams } = new URL(req.url);
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
    const from = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const localRows = await prisma.billingTransaction.findMany({
      where: {
        transactionDate: { gte: from, lte: to },
        status: "PAID",
        subscriptionListAmount: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        amount: true,
        providerReference: true,
        transactionDate: true,
        description: true,
      },
    });

    const localTotal = localRows.reduce((s, r) => s + toNumber(r.amount), 0);
    const localCount = localRows.length;

    let razorpayTotal = 0;
    let razorpayCount = 0;
    let razorpayError: string | null = null;

    try {
      const Razorpay = (await import("razorpay")).default;
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (keyId && keySecret) {
        const rz = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const fromSec = Math.floor(from.getTime() / 1000);
        const toSec = Math.floor(to.getTime() / 1000);
        let skip = 0;
        const pageSize = 100;
        for (;;) {
          const res = (await rz.payments.all({
            from: fromSec,
            to: toSec,
            count: pageSize,
            skip,
          })) as { items?: Array<{ status?: string; amount?: number }> };
          const items = res.items ?? [];
          for (const p of items) {
            if (p.status === "captured" || p.status === "authorized") {
              razorpayTotal += Number(p.amount ?? 0) / 100;
              razorpayCount += 1;
            }
          }
          if (items.length < pageSize) break;
          skip += pageSize;
          if (skip > 5000) break;
        }
      }
    } catch (e) {
      razorpayError = e instanceof Error ? e.message : "Razorpay list failed";
    }

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      local: { count: localCount, totalInr: localTotal },
      razorpay: { count: razorpayCount, totalInr: razorpayTotal, error: razorpayError },
      varianceInr: razorpayError ? null : razorpayTotal - localTotal,
    });
  } catch (error) {
    return handleAdminApiError(error, "Reconciliation failed");
  }
}
