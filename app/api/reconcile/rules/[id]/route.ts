import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { z } from "zod";

const PatchSchema = z.object({
  isActive: z.boolean().optional(),
  pattern: z.string().min(1).max(500).optional(),
  priority: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireReconAccess("reconciliation.commit");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.bankReconciliationRule.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.bankReconciliationRule.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireReconAccess("reconciliation.commit");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const { id } = await context.params;
  const existing = await prisma.bankReconciliationRule.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.bankReconciliationRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
