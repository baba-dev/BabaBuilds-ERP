import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const STANDARD = [
  "Advertising & Marketing",
  "Bank Fees & Charges",
  "Contractors & Freelancers",
  "Cost of Goods Sold (COGS)",
  "Insurance",
  "Meals & Entertainment",
  "Office Supplies",
  "Payroll & Benefits",
  "Professional Services (Legal/Accounting)",
  "Rent & Lease",
  "Software & IT",
  "Taxes & Licenses",
  "Travel",
  "Utilities",
  "Capital Injection (Income)",
  "Revenue / Sales (Income)",
  "Uncategorized",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const custom = await prisma.expenseReconciliationCategory.findMany({
    where: { workspaceId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true },
  });
  const names = Array.from(
    new Set([...STANDARD, ...custom.map((c) => c.name)]),
  ).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ data: names });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const Schema = z.object({ name: z.string().min(1).max(120) });
  const json = await request.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const created = await prisma.expenseReconciliationCategory.upsert({
    where: {
      workspaceId_name: { workspaceId, name: parsed.data.name.trim() },
    },
    create: {
      workspaceId,
      name: parsed.data.name.trim(),
      sortOrder: 1000,
    },
    update: {},
  });
  return NextResponse.json({ data: created.name }, { status: 201 });
}
