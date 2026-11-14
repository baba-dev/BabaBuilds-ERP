import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { logActivity } from "@/lib/security/activity-log";
import { getOrCreateReconciliationSettings } from "@/lib/reconciliation/reconciliation-settings";

export async function GET() {
  const access = await requireReconAccess("reconciliation.import");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;
  const s = await getOrCreateReconciliationSettings(workspaceId);
  return NextResponse.json({ data: s });
}

export async function PATCH(request: Request) {
  const access = await requireReconAccess("reconciliation.commit");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bad = (field: string) => NextResponse.json({ error: `Check ${field}.`, code: "VALIDATION", field }, { status: 422 });
  const int = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
  const patch: { autoMatchMinScore?: number; autoMatchSuggestionMin?: number; importRawRetentionDays?: number; storeRawImportBytes?: boolean; bankFeedProvider?: string } = {};
  if (body.autoMatchMinScore !== undefined) { const n = int(body.autoMatchMinScore, 50, 100); if (n === null) return bad("autoMatchMinScore"); patch.autoMatchMinScore = n; }
  if (body.autoMatchSuggestionMin !== undefined) { const n = int(body.autoMatchSuggestionMin, 0, 100); if (n === null) return bad("autoMatchSuggestionMin"); patch.autoMatchSuggestionMin = n; }
  if (body.importRawRetentionDays !== undefined) { const n = int(body.importRawRetentionDays, 0, 3650); if (n === null) return bad("importRawRetentionDays"); patch.importRawRetentionDays = n; }
  if (body.storeRawImportBytes !== undefined) patch.storeRawImportBytes = Boolean(body.storeRawImportBytes);
  if (body.bankFeedProvider !== undefined) patch.bankFeedProvider = String(body.bankFeedProvider).slice(0, 32);
  const current = await getOrCreateReconciliationSettings(workspaceId);
  const nextMin = patch.autoMatchMinScore ?? current.autoMatchMinScore;
  const nextSuggest = patch.autoMatchSuggestionMin ?? current.autoMatchSuggestionMin;
  if (nextSuggest > nextMin) return bad("autoMatchSuggestionMin");

  const updated = await prisma.workspaceReconciliationSettings.update({ where: { workspaceId }, data: patch });
  void logActivity({ action: "reconciliation_settings_updated", status: "SUCCESS", workspaceId, actor: { userId: access.ctx.userId, email: access.ctx.email ?? undefined }, entity: { type: "reconciliation_settings", id: workspaceId }, metadata: patch });

  return NextResponse.json({
    data: {
      autoMatchMinScore: updated.autoMatchMinScore,
      autoMatchSuggestionMin: updated.autoMatchSuggestionMin,
      importRawRetentionDays: updated.importRawRetentionDays,
      storeRawImportBytes: updated.storeRawImportBytes,
      bankFeedProvider: updated.bankFeedProvider,
    },
  });
}
