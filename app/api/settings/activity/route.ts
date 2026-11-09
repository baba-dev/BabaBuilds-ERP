import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSettingsManager } from "@/lib/settings/access";

/** Recent settings changes: who changed what and when. Field names only, never values. */
export async function GET() {
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const rows = await prisma.appActivityLog.findMany({
    where: { workspaceId: auth.actor.workspaceId, action: { startsWith: "settings_" }, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, action: true, actorEmail: true, metadata: true, createdAt: true },
  });
  return NextResponse.json({
    activity: rows.map((r) => {
      const m = (r.metadata ?? {}) as { section?: unknown; changedFieldNames?: unknown; secret?: unknown; kind?: unknown };
      return {
        id: r.id,
        action: r.action,
        actor: r.actorEmail ?? "system",
        section: typeof m.section === "string" ? m.section : null,
        fields: Array.isArray(m.changedFieldNames) ? m.changedFieldNames.filter((f): f is string => typeof f === "string").slice(0, 12) : [],
        secret: typeof m.secret === "string" ? m.secret : null,
        kind: typeof m.kind === "string" ? m.kind : null,
        at: r.createdAt.toISOString(),
      };
    }),
  });
}
