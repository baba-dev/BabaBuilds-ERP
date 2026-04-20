import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdmin } from "../../../authz";
import { Prisma } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

function esc(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  try {
    await verifySuperAdmin();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where =
      from && to
        ? { createdAt: { gte: new Date(from), lte: new Date(to) } }
        : {};

    const rows = await prisma.distributorCommission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        distributor: { select: { name: true, email: true } },
        coupon: { select: { code: true } },
        workspace: { select: { name: true } },
      },
    });

    const header = [
      "id",
      "createdAt",
      "status",
      "distributor",
      "coupon",
      "workspace",
      "listAmount",
      "paidAmount",
      "marginPercent",
      "marginBasis",
      "commissionAmount",
    ].join(",");

    const lines = rows.map((r) =>
      [
        r.id,
        r.createdAt.toISOString(),
        r.status,
        esc(r.distributor.name),
        r.coupon?.code ?? "",
        esc(r.workspace.name),
        toNumber(r.listAmount),
        toNumber(r.paidAmount),
        toNumber(r.marginPercent),
        r.marginBasisUsed,
        toNumber(r.commissionAmount),
      ].join(","),
    );

    const csv = [header, ...lines].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="distributor-commissions.csv"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
