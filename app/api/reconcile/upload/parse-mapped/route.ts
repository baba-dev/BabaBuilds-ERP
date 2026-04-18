import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const profile = await prisma.businessProfile.findUnique({
      where: { workspaceId },
    });
    let groqApiKey: string | null = null;
    if (profile?.groqApiKey) {
      try {
        groqApiKey = decrypt(profile.groqApiKey);
      } catch {
        groqApiKey = profile.groqApiKey;
      }
    }

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
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) {
      return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
    }

    const lower = fileName.toLowerCase();
    let rows: string[][];
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      rows = excelBufferToGrid(buffer);
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
    });

    return NextResponse.json({
      autoMatched,
      aiSuggestions,
      ignored: [],
      bankAccountId,
      encoding: "manual-map",
    });
  } catch (e) {
    console.error("parse-mapped error", e);
    return NextResponse.json(
      { error: "Failed to process bank statement securely." },
      { status: 500 },
    );
  }
}
