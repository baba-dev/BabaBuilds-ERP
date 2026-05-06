import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";
import { z } from "zod";

const BankAccountCreateSchema = z.object({
  name: z.string().min(1).max(120),
  bankName: z.string().max(120).optional().nullable(),
  accountHolderName: z.string().max(120).optional().nullable(),
  maskedAccountNumber: z.string().max(32).optional().nullable(),
  routingCode: z.string().max(64).optional().nullable(),
  currency: z.string().min(3).max(8).optional().nullable(),
  openingBalance: z.number().finite().optional().nullable(),
  openingBalanceDate: z.string().datetime().optional().nullable(),
});

function toSafeBankAccountDto(account: {
  id: string;
  name: string;
  bankName: string | null;
  accountHolderName: string | null;
  maskedAccountNumber: string | null;
  routingCode: string | null;
  currency: string;
  openingBalance: unknown;
  openingBalanceDate: Date;
  isPrimaryRemittance: boolean;
  sourceType: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    name: account.name,
    bankName: account.bankName,
    accountHolderName: account.accountHolderName,
    maskedAccountNumber: account.maskedAccountNumber,
    routingCode: account.routingCode,
    currency: account.currency,
    openingBalance: account.openingBalance,
    openingBalanceDate: account.openingBalanceDate,
    isPrimaryRemittance: account.isPrimaryRemittance,
    sourceType: account.sourceType,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const accounts = await prisma.bankAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: accounts.map(toSafeBankAccountDto) });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const json = await request.json().catch(() => null);
  const parsed = BankAccountCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.bankAccount.create({
    data: {
      workspaceId,
      name: parsed.data.name,
      bankName: parsed.data.bankName ?? null,
      accountHolderName: parsed.data.accountHolderName ?? null,
      maskedAccountNumber: parsed.data.maskedAccountNumber ?? null,
      routingCode: parsed.data.routingCode ?? null,
      sourceType: "CASH_FLOW",
      currency: (parsed.data.currency ?? undefined) || "INR",
      openingBalance: parsed.data.openingBalance ?? 0,
      openingBalanceDate: parsed.data.openingBalanceDate ? new Date(parsed.data.openingBalanceDate) : new Date(),
    },
  });

  return NextResponse.json({ data: toSafeBankAccountDto(created) }, { status: 201 });
}
