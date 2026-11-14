import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  openingBalance: z.number().finite().min(-1e12).max(1e12).optional(),
  openingBalanceDate: z.string().min(1).optional(),
}).strict();

/** Fix the starting balance or name of an account. The forecast starts from this balance, so changes are logged with the old value. */
export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cashFlowError(422, "VALIDATION", "Check the account details.");
  const { workspaceId, userId, email } = auth.ctx;
  const found = await prisma.bankAccount.findFirst({ where: { id, workspaceId }, select: { name: true, openingBalance: true, openingBalanceDate: true } });
  if (!found) return cashFlowError(404, "NOT_FOUND", "Account not found.");
  const data: Prisma.BankAccountUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.openingBalance !== undefined) data.openingBalance = parsed.data.openingBalance;
  if (parsed.data.openingBalanceDate !== undefined) {
    const d = new Date(parsed.data.openingBalanceDate);
    if (Number.isNaN(d.getTime())) return cashFlowError(422, "VALIDATION", "Check the date.", { fields: [{ field: "openingBalanceDate", code: "DATE" }] });
    data.openingBalanceDate = d;
  }
  try {
    await prisma.bankAccount.update({ where: { id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return cashFlowError(409, "DUPLICATE_NAME", "An account with this name already exists.");
    throw error;
  }
  void logActivity({ action: "bank_account_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, request, entity: { type: "bank_account", id }, metadata: { from: { name: found.name, openingBalance: Number(found.openingBalance), openingBalanceDate: found.openingBalanceDate.toISOString() }, to: parsed.data } });
  return NextResponse.json({ success: true });
}
