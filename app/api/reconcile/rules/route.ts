import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { z } from "zod";

const RuleSchema = z.object({
  pattern: z.string().min(1).max(500),
  priority: z.number().int().optional(),
  matchTxnType: z.enum(["ANY", "DEBIT", "CREDIT"]).optional(),
  setCategory: z.string().max(120).nullable().optional(),
  setVendor: z.string().max(120).nullable().optional(),
  setInternalTransfer: z.boolean().optional(),
});

export async function GET() {
  const access = await requireReconAccess("reconciliation.import");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const rules = await prisma.bankReconciliationRule.findMany({
    where: { workspaceId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data: rules });
}

export async function POST(request: Request) {
  const access = await requireReconAccess("reconciliation.commit");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const json = await request.json().catch(() => null);
  const parsed = RuleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.bankReconciliationRule.create({
    data: {
      workspaceId,
      pattern: parsed.data.pattern,
      priority: parsed.data.priority ?? 0,
      matchTxnType: parsed.data.matchTxnType ?? "ANY",
      setCategory: parsed.data.setCategory ?? null,
      setVendor: parsed.data.setVendor ?? null,
      setInternalTransfer: parsed.data.setInternalTransfer ?? false,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
