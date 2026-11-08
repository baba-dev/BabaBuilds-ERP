import { NextResponse } from "next/server";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { billRetainer } from "@/lib/retainers/billing";
import { checkRateLimit } from "@/lib/rate-limit-memory";

/** Issues the upcoming cycle's invoice immediately and moves the schedule forward. Safe against double clicks. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const { id } = await params;
  const limited = checkRateLimit(`retainer-bill:${workspaceId}:${id}`, 5, 60_000);
  if (!limited.ok) return retainerError(429, "RATE_LIMITED", "Please wait a moment before billing again.");
  const result = await billRetainer({ retainerId: id, workspaceId, trigger: "manual", actorUserId: userId });
  if (!result.ok) {
    const status = result.code === "RETAINER_NOT_FOUND" ? 404 : result.skipped ? 409 : result.code === "FREE_INVOICE_LIMIT" ? 402 : 422;
    return retainerError(status, result.code, result.message);
  }
  return NextResponse.json({ success: true, invoice: result.invoice, emailed: result.emailed, completed: result.completed });
}
