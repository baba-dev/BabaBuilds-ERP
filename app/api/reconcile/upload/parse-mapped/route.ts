import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { scanBuffer } from "@/lib/security/clamav";
import {
  decodeBankStatementBuffer,
  extractTransactionsFromGrid,
  parseRows,
  type ColumnMapping,
  type DateParsePreference,
} from "@/lib/reconciliation/bank-csv-parse";
import { excelBufferToGrid } from "@/lib/reconciliation/bank-excel";
import { persistAndMatchTransactions } from "@/lib/reconciliation/run-reconciliation-upload";
import { getOrCreateReconciliationSettings } from "@/lib/reconciliation/reconciliation-settings";
import { withPermission } from "@/lib/rbac";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const rate = enforceRouteRateLimit({ request, route: "/api/reconcile/upload/parse-mapped", scope: "bank-import", max: 20, windowMs: 10 * 60 * 1000 });
  if (!rate.ok) return rate.response;
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const userId = (session as { user?: { id?: string } }).user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permission = await withPermission(
      userId,
      workspaceId,
      "reconciliation.import",
    );
    if (!permission.granted) return permission.response;

    const profile = await prisma.businessProfile.findUnique({
      where: { workspaceId },
    });
    const serverGroq = process.env.GROQ_RECONCILIATION_API_KEY?.trim() || null;
    let userGroqKey: string | null = null;
    if (profile?.groqApiKey) {
      try {
        userGroqKey = decrypt(profile.groqApiKey);
      } catch {
        userGroqKey = profile.groqApiKey;
      }
    }
    const groqApiKey = serverGroq || userGroqKey;
    const settings = await getOrCreateReconciliationSettings(workspaceId);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const bankAccountId = typeof body.bankAccountId === "string" ? body.bankAccountId : "";
    const headerRowIndex =
      typeof body.headerRowIndex === "number" ? body.headerRowIndex : 0;
    const delimiter =
      typeof body.delimiter === "string" && body.delimiter.length > 0
        ? body.delimiter
        : ",";
    const mapping = body.mapping as ColumnMapping | undefined;
    const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
    const fileName = typeof body.fileName === "string" ? body.fileName : "statement.csv";
    const datePreference = (body.datePreference as DateParsePreference) ?? "AUTO";

    if (!bankAccountId || !mapping || !fileBase64) {
      return NextResponse.json(
        { error: "bankAccountId, mapping, and fileBase64 are required." },
        { status: 400 },
      );
    }

    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, workspaceId },
    });
    if (!account) {
      return NextResponse.json({ error: "Bank account not found." }, { status: 404 });
    }

    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large." }, { status: 400 });
    }
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) {
      return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
    }

    const importBatch = await prisma.bankImportBatch.create({
      data: {
        workspaceId,
        accountId: bankAccountId,
        fileName,
        status: "PENDING",
        parseVersion: "2-manual-map",
        createdByUserId: userId,
        rawFileData:
          settings.storeRawImportBytes && settings.importRawRetentionDays > 0
            ? buffer
            : undefined,
      },
    });

    const lower = fileName.toLowerCase();
    let rows: string[][];
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      rows = await excelBufferToGrid(buffer);
    } else {
      const { text } = decodeBankStatementBuffer(buffer);
      rows = parseRows(text, delimiter);
    }

    const extracted = extractTransactionsFromGrid({
      rows,
      headerRowIndex,
      mapping,
      datePreference,
    });

    if (extracted.length === 0) {
      await prisma.bankImportBatch.update({
        where: { id: importBatch.id },
        data: { status: "FAILED" },
      });
      return NextResponse.json(
        { error: "No transactions extracted with the provided mapping." },
        { status: 400 },
      );
    }

    const { autoMatched, aiSuggestions } = await persistAndMatchTransactions({
      workspaceId,
      accountId: bankAccountId,
      parsed: extracted,
      groqApiKey,
      settings,
      importBatchId: importBatch.id,
    });

    await prisma.bankImportBatch.update({
      where: { id: importBatch.id },
      data: {
        status: "COMPLETED",
        rowCount: extracted.length,
        parseMeta: { manualMap: true } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      autoMatched,
      aiSuggestions,
      ignored: [],
      bankAccountId,
      importBatchId: importBatch.id,
      encoding: "manual-map",
      reconciliationSettings: {
        autoMatchMinScore: settings.autoMatchMinScore,
        autoMatchSuggestionMin: settings.autoMatchSuggestionMin,
      },
    });
  } catch (e) {
    console.error("parse-mapped error", e);
    return NextResponse.json(
      { error: "Failed to process bank statement securely." },
      { status: 500 },
    );
  }
}
