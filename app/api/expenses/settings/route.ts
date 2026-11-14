import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { getExpenseSettings, newInboxToken } from "@/lib/expenses/settings";
import { logActivity } from "@/lib/security/activity-log";

/** Anyone who can see expenses sees whether approval is on (the form needs it); the inbox address is only shown to approvers. */
export async function GET(request: Request) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const s = await getExpenseSettings(auth.ctx.workspaceId);
  const canManage = (await requireExpenseAccess("expenses.approve")).ok;
  const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  return NextResponse.json({ data: { approvalRequired: s.approvalRequired, approvalThreshold: s.approvalThreshold, inboxEnabled: s.inboxEnabled, canManage, inboxUrl: canManage && s.inboxEnabled && s.inboxToken ? `${origin}/api/expenses/inbound/${s.inboxToken}` : null } });
}

const patch = z.object({ approvalRequired: z.boolean().optional(), approvalThreshold: z.number().min(0).max(100_000_000_000).optional(), inboxEnabled: z.boolean().optional(), rotateInbox: z.boolean().optional() });

export async function PATCH(request: Request) {
  const auth = await requireExpenseAccess("expenses.approve");
  if (!auth.ok) return auth.response;
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return expenseError(400, "INVALID_BODY", "Check the settings.");
  const { workspaceId } = auth.ctx;
  const cur = await getExpenseSettings(workspaceId);
  const wantsInbox = parsed.data.inboxEnabled ?? cur.inboxEnabled;
  const token = parsed.data.rotateInbox || (wantsInbox && !cur.inboxToken) ? newInboxToken() : cur.inboxToken;
  const data = { approvalRequired: parsed.data.approvalRequired ?? cur.approvalRequired, approvalThreshold: parsed.data.approvalThreshold ?? cur.approvalThreshold, inboxEnabled: wantsInbox, inboxToken: token };
  await prisma.expenseSettings.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
  void logActivity({ action: "expense_settings_updated", status: "SUCCESS", workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "expense_settings", id: workspaceId }, metadata: { approvalRequired: data.approvalRequired, approvalThreshold: data.approvalThreshold, inboxEnabled: data.inboxEnabled, rotated: Boolean(parsed.data.rotateInbox) } });
  return NextResponse.json({ success: true });
}
