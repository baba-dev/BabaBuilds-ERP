import { NextResponse } from "next/server";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { billRetainer } from "@/lib/retainers/billing";
import { changeRetainerStatus } from "@/lib/retainers/lifecycle";
import { afterRetainerChange } from "@/lib/retainers/save";
import { bulkActionSchema } from "@/lib/retainers/validation";
import { checkRateLimit } from "@/lib/rate-limit-memory";

/** Pause, resume or bill several retainers. One result per id; a failure never stops the others. */
export async function POST(request: Request) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const parsed = bulkActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return retainerError(400, "VALIDATION_ERROR", "Choose an action and between 1 and 50 retainers.");
  const { action, ids } = parsed.data;
  if (action === "billNow" && !await checkRateLimit(`retainer-bulk-bill:${workspaceId}`, 5, 60_000).ok) return retainerError(429, "RATE_LIMITED", "Please wait a moment before billing again.");

  const results: Array<{ id: string; ok: boolean; message?: string }> = [];
  // Sequential on purpose: billing allocates invoice numbers per workspace.
  for (const id of [...new Set(ids)]) {
    if (action === "billNow") {
      const r = await billRetainer({ retainerId: id, workspaceId, trigger: "manual", actorUserId: userId });
      results.push(r.ok ? { id, ok: true } : { id, ok: false, message: r.message });
    } else {
      const r = await changeRetainerStatus({ workspaceId, retainerId: id, to: action === "pause" ? "PAUSED" : "ACTIVE", actorUserId: userId });
      results.push(r.ok ? { id, ok: true } : { id, ok: false, message: r.message });
    }
  }
  afterRetainerChange(workspaceId, `bulk-${action}`);
  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({ success: true, succeeded, failed: results.length - succeeded, results });
}
