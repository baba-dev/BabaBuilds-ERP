import { NextResponse } from "next/server";
import { logActivity } from "@/lib/security/activity-log";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { statusChangeSchema } from "@/lib/retainers/validation";
import { changeRetainerStatus } from "@/lib/retainers/lifecycle";
import { afterRetainerChange } from "@/lib/retainers/save";

/** Pause, resume or cancel. The billing job only picks up ACTIVE retainers, so this is what actually stops billing. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;
  const { id } = await params;
  const parsed = statusChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return retainerError(400, "INVALID_STATUS", "Choose ACTIVE, PAUSED or CANCELLED.");
  const result = await changeRetainerStatus({ workspaceId, retainerId: id, to: parsed.data.status, actorUserId: userId, reason: parsed.data.reason });
  if (!result.ok) return retainerError(result.status, result.code, result.message);
  logActivity({ action: "retainer_status_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "retainer", id }, request, metadata: { to: result.status } });
  afterRetainerChange(workspaceId, "status");
  return NextResponse.json({ success: true, status: result.status, rolledForward: result.rolledForward });
}
