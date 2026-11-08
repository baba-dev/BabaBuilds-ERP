import "server-only";
import { prisma } from "@/lib/prisma";
import { addRetainerEvent } from "@/lib/retainers/events";
import { advanceBillingDate } from "@/lib/retainers/schedule";
import { canTransition, startOfUtcDay } from "@/lib/retainers/status";

export type StatusResult = { ok: true; status: string; rolledForward: boolean } | { ok: false; status: number; code: string; message: string };

/**
 * Pause / resume / cancel with a compare-and-set on the status we validated against. Resuming a retainer whose date
 * passed while it was paused rolls the schedule forward instead of back-billing every missed cycle.
 */
export async function changeRetainerStatus(args: { workspaceId: string; retainerId: string; to: "ACTIVE" | "PAUSED" | "CANCELLED"; actorUserId?: string | null; reason?: string | null; now?: Date }): Promise<StatusResult> {
  const now = args.now ?? new Date();
  const row = await prisma.retainer.findFirst({ where: { id: args.retainerId, workspaceId: args.workspaceId }, select: { status: true, nextBillingDate: true, frequency: true } });
  if (!row) return { ok: false, status: 404, code: "RETAINER_NOT_FOUND", message: "Retainer not found." };
  if (!canTransition(row.status, args.to)) {
    return { ok: false, status: 409, code: "INVALID_TRANSITION", message: `A ${row.status.toLowerCase()} retainer cannot be set to ${args.to.toLowerCase()}.` };
  }
  let next = row.nextBillingDate;
  let rolledForward = false;
  if (args.to === "ACTIVE") {
    for (let i = 0; i < 240 && startOfUtcDay(next) < startOfUtcDay(now); i += 1) {
      next = advanceBillingDate(next, row.frequency);
      rolledForward = true;
    }
  }
  const res = await prisma.retainer.updateMany({
    where: { id: args.retainerId, workspaceId: args.workspaceId, status: row.status },
    data: { status: args.to, ...(rolledForward ? { nextBillingDate: next } : {}), ...(args.to === "CANCELLED" ? { cancelledAt: now } : {}), ...(args.to === "ACTIVE" ? { lastError: null, lastErrorAt: null } : {}) },
  });
  if (res.count === 0) return { ok: false, status: 409, code: "STALE_STATUS", message: "This retainer just changed. Refresh and try again." };
  await addRetainerEvent(prisma, {
    workspaceId: args.workspaceId,
    retainerId: args.retainerId,
    type: args.to === "PAUSED" ? "PAUSED" : args.to === "CANCELLED" ? "CANCELLED" : "RESUMED",
    message: args.reason || (rolledForward ? `Next billing moved to ${next.toISOString().slice(0, 10)}` : null),
    actorUserId: args.actorUserId,
    metadata: { from: row.status, to: args.to },
  });
  return { ok: true, status: args.to, rolledForward };
}
