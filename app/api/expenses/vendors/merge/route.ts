import { NextResponse } from "next/server";
import { z } from "zod";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { mergeVendors } from "@/lib/expenses/vendors";
import { logActivity } from "@/lib/security/activity-log";

export async function POST(request: Request) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const parsed = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return expenseError(400, "INVALID_BODY", "Choose the vendor to merge and the one to keep.");
  const r = await mergeVendors(auth.ctx.workspaceId, parsed.data.sourceId, parsed.data.targetId);
  if (!r.ok) return expenseError(r.status, r.code, r.message);
  void logActivity({ action: "vendor_merged", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "vendor", id: parsed.data.targetId }, metadata: { merged: parsed.data.sourceId } });
  return NextResponse.json({ success: true });
}
