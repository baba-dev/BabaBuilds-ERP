import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientError, requireClientAccess } from "@/lib/clients/access";
import { parseTags, serializeTags } from "@/lib/clients/tags";
import { CLIENT_STATUSES } from "@/lib/clients/schema";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

const body = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["ARCHIVE", "RESTORE", "ADD_TAG", "REMOVE_TAG", "SET_STATUS", "SET_OWNER"]),
  value: z.string().trim().max(60).optional(),
});

/** One action on up to 200 clients. Every client is checked against the workspace; the result says how many changed. */
export async function POST(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/clients/bulk", scope: "client-bulk", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return clientError(400, "INVALID_BODY", "Choose clients and an action.");
  const { ids, action, value } = parsed.data;
  const { workspaceId } = auth.ctx;
  const where = { id: { in: ids }, workspaceId, isWalkIn: false };
  let changed = 0;

  if (action === "ARCHIVE" || action === "RESTORE") changed = (await prisma.client.updateMany({ where, data: { archivedAt: action === "ARCHIVE" ? new Date() : null } })).count;
  else if (action === "SET_STATUS") {
    if (!value || !(CLIENT_STATUSES as readonly string[]).includes(value)) return clientError(400, "INVALID_BODY", "Choose a status.");
    changed = (await prisma.client.updateMany({ where, data: { status: value } })).count;
  } else if (action === "SET_OWNER") {
    if (value) {
      const member = await prisma.workspaceUser.findFirst({ where: { workspaceId, userId: value, isActive: true }, select: { id: true } });
      if (!member) return clientError(400, "OWNER_INVALID", "The owner has to be a member of this workspace.");
    }
    changed = (await prisma.client.updateMany({ where, data: { ownerUserId: value || null } })).count;
  } else {
    if (!value) return clientError(400, "INVALID_BODY", "Type a tag.");
    const rows = await prisma.client.findMany({ where, select: { id: true, tags: true } });
    for (const r of rows) {
      const tags = parseTags(r.tags);
      const next = action === "ADD_TAG" ? serializeTags([...tags, value]) : serializeTags(tags.filter((t) => t !== value.toLowerCase().trim()));
      if (next !== r.tags) { await prisma.client.update({ where: { id: r.id }, data: { tags: next } }); changed += 1; }
    }
  }
  try { invalidateDashboardCacheForWorkspace(workspaceId); } catch { /* best effort */ }
  void logActivity({ action: `client_bulk_${action.toLowerCase()}`, status: "SUCCESS", workspaceId, actor: { userId: auth.ctx.userId ?? undefined, email: auth.ctx.email ?? undefined }, entity: { type: "client", id: null }, metadata: { requested: ids.length, changed, value: value ?? null } }).catch(() => null);
  return NextResponse.json({ success: true, requested: ids.length, changed });
}
