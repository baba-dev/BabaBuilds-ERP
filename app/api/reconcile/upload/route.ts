import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scanBuffer } from "@/lib/security/clamav";
import { decrypt } from "@/lib/encryption";
import {
  decodeBankStatementBuffer,
  parseBankStatementFromBuffer,
  parseBankStatementFromRows,
  parseRows,
  type DateParsePreference,
} from "@/lib/reconciliation/bank-csv-parse";
import { excelBufferToGrid } from "@/lib/reconciliation/bank-excel";
import { parseOfxTransactions } from "@/lib/reconciliation/bank-ofx";
import { parseBankPdfToTransactions } from "@/lib/reconciliation/bank-pdf";
import { persistAndMatchTransactions } from "@/lib/reconciliation/run-reconciliation-upload";
import { getOrCreateReconciliationSettings } from "@/lib/reconciliation/reconciliation-settings";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const userId = (session as { user?: { id?: string } }).user?.id ?? null;

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bankAccountIdRaw = formData.get("bankAccountId");
    const bankAccountId =
      typeof bankAccountIdRaw === "string" ? bankAccountIdRaw : "";
    const datePreference = (formData.get("datePreference") as DateParsePreference) ?? "AUTO";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!bankAccountId) {
      return NextResponse.json(
        { error: "Select a bank account for this import." },
        { status: 400 },
      );
    }

    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, workspaceId },
    });
    if (!account) {
      return NextResponse.json({ error: "Bank account not found." }, { status: 404 });
    }

    const fileBytes = await file.arrayBuffer();
    if (fileBytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(fileBytes);
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) {
      return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
    }

    const importBatch = await prisma.bankImportBatch.create({
      data: {
        workspaceId,
        accountId: bankAccountId,
        fileName: file.name,
        mimeType: file.type || null,
        status: "PENDING",
        parseVersion: "2",
        createdByUserId: userId,
        rawFileData:
          settings.storeRawImportBytes && settings.importRawRetentionDays > 0
            ? buffer
            : undefined,
      },
    });

    const lower = file.name.toLowerCase();
    let transactions: import("@/lib/reconciliation/bank-csv-parse").ParsedBankTransaction[] = [];
    let parseMeta: Prisma.InputJsonValue = {};

    if (lower.endsWith(".ofx") || lower.endsWith(".qfx")) {
      const text = buffer.toString("utf-8");
      transactions = parseOfxTransactions(text);
      parseMeta = { format: "OFX", rowCount: transactions.length };
    } else if (lower.endsWith(".pdf")) {
      transactions = await parseBankPdfToTransactions(buffer);
      parseMeta = { format: "PDF", rowCount: transactions.length };
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const rows = excelBufferToGrid(buffer);
      const parseResult = parseBankStatementFromRows(rows, {
        datePreference,
        encoding: "xlsx",
      });
      if (!parseResult.ok && parseResult.needsMapping) {
        await prisma.bankImportBatch.update({
          where: { id: importBatch.id },
          data: { status: "FAILED", parseMeta: { needsMapping: true } as Prisma.InputJsonValue },
        });
        return NextResponse.json(
          {
            needsMapping: true,
            message: parseResult.message,
            previewRows: rows.slice(0, 20),
            candidateHeaderIndices: parseResult.candidateHeaderIndices,
            delimiter: ",",
            encoding: "xlsx",
            fileName: file.name,
            bankAccountId,
            importBatchId: importBatch.id,
          },
          { status: 200 },
        );
      }
      if (!parseResult.ok) {
        await prisma.bankImportBatch.update({
          where: { id: importBatch.id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({ error: "Could not parse bank statement." }, { status: 400 });
      }
      transactions = parseResult.transactions;
      parseMeta = {
        format: "XLSX",
        confidence: parseResult.confidence,
        headerRowIndex: parseResult.headerRowIndex,
        columnLabels: parseResult.columnLabels,
      };
    } else {
      const parseResult = parseBankStatementFromBuffer(buffer, { datePreference });
      if (!parseResult.ok && parseResult.needsMapping) {
        const { text } = decodeBankStatementBuffer(buffer);
        const previewRows = parseRows(text, parseResult.delimiter).slice(0, 20);
        await prisma.bankImportBatch.update({
          where: { id: importBatch.id },
          data: { status: "FAILED", parseMeta: { needsMapping: true } as Prisma.InputJsonValue },
        });
        return NextResponse.json(
          {
            needsMapping: true,
            message: parseResult.message,
            previewRows,
            candidateHeaderIndices: parseResult.candidateHeaderIndices,
            delimiter: parseResult.delimiter,
            encoding: parseResult.encoding,
            fileName: file.name,
            bankAccountId,
            importBatchId: importBatch.id,
          },
          { status: 200 },
        );
      }
      if (!parseResult.ok) {
        await prisma.bankImportBatch.update({
          where: { id: importBatch.id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({ error: "Could not parse bank statement." }, { status: 400 });
      }
      transactions = parseResult.transactions;
      parseMeta = {
        format: "CSV",
        confidence: parseResult.confidence,
        headerRowIndex: parseResult.headerRowIndex,
        delimiter: parseResult.delimiter,
        encoding: parseResult.encoding,
        columnLabels: parseResult.columnLabels,
      };
    }

    if (transactions.length === 0) {
      await prisma.bankImportBatch.update({
        where: { id: importBatch.id },
        data: {
          status: "FAILED",
          rowCount: 0,
          parseMeta: JSON.parse(JSON.stringify(parseMeta)) as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json(
        { error: "No transactions found in file." },
        { status: 400 },
      );
    }

    const { autoMatched, aiSuggestions } = await persistAndMatchTransactions({
      workspaceId,
      accountId: bankAccountId,
      parsed: transactions,
      groqApiKey,
      settings,
      importBatchId: importBatch.id,
    });

    await prisma.bankImportBatch.update({
      where: { id: importBatch.id },
      data: {
        status: "COMPLETED",
        rowCount: transactions.length,
        parseMeta: JSON.parse(
          JSON.stringify({
            ...parseMeta,
            autoMatched: autoMatched.length,
            aiQueue: aiSuggestions.length,
          }),
        ) as Prisma.InputJsonValue,
      },
    });

    console.info(
      JSON.stringify({
        event: "reconciliation_import",
        workspaceId,
        importBatchId: importBatch.id,
        rowCount: transactions.length,
        ms: Date.now() - started,
      }),
    );

    return NextResponse.json({
      autoMatched,
      aiSuggestions,
      ignored: [],
      bankAccountId,
      importBatchId: importBatch.id,
      parseMeta,
      reconciliationSettings: {
        autoMatchMinScore: settings.autoMatchMinScore,
        autoMatchSuggestionMin: settings.autoMatchSuggestionMin,
      },
    });
  } catch (e) {
    console.error("reconcile upload", e);
    return NextResponse.json(
      {
        error:
          "Failed to process bank statement securely. Please check your data or API key.",
      },
      { status: 500 },
    );
  }
}
