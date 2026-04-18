import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateReconciliationSettings } from "@/lib/reconciliation/reconciliation-settings";

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await getOrCreateReconciliationSettings(workspaceId);
  return NextResponse.json({ data: s });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updated = await prisma.workspaceReconciliationSettings.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      autoMatchMinScore: Number(body.autoMatchMinScore ?? 95),
      autoMatchSuggestionMin: Number(body.autoMatchSuggestionMin ?? 70),
      importRawRetentionDays: Number(body.importRawRetentionDays ?? 0),
      storeRawImportBytes: Boolean(body.storeRawImportBytes),
      bankFeedProvider: String(body.bankFeedProvider ?? "NONE").slice(0, 32),
    },
    update: {
      ...(body.autoMatchMinScore !== undefined && {
        autoMatchMinScore: Number(body.autoMatchMinScore),
      }),
      ...(body.autoMatchSuggestionMin !== undefined && {
        autoMatchSuggestionMin: Number(body.autoMatchSuggestionMin),
      }),
      ...(body.importRawRetentionDays !== undefined && {
        importRawRetentionDays: Number(body.importRawRetentionDays),
      }),
      ...(body.storeRawImportBytes !== undefined && {
        storeRawImportBytes: Boolean(body.storeRawImportBytes),
      }),
      ...(body.bankFeedProvider !== undefined && {
        bankFeedProvider: String(body.bankFeedProvider).slice(0, 32),
      }),
    },
  });

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
