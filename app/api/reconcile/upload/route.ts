import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
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
    const buffer = Buffer.from(fileBytes);
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) {
      return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    let parseResult:
      | ReturnType<typeof parseBankStatementFromBuffer>
      | ReturnType<typeof parseBankStatementFromRows>;

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const rows = excelBufferToGrid(buffer);
      parseResult = parseBankStatementFromRows(rows, {
        datePreference,
        encoding: "xlsx",
      });
    } else {
      parseResult = parseBankStatementFromBuffer(buffer, { datePreference });
    }

    if (!parseResult.ok && parseResult.needsMapping) {
      let previewRows = parseResult.previewRows;
      let delimiter = parseResult.delimiter;

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const rows = excelBufferToGrid(buffer);
        previewRows = rows.slice(0, 20);
        delimiter = ",";
      } else {
        const { text } = decodeBankStatementBuffer(buffer);
        previewRows = parseRows(text, delimiter).slice(0, 20);
      }

      return NextResponse.json(
        {
          needsMapping: true,
          message: parseResult.message,
          previewRows,
          candidateHeaderIndices: parseResult.candidateHeaderIndices,
          delimiter,
          encoding: !parseResult.ok ? parseResult.encoding : "utf-8",
          fileName: file.name,
          bankAccountId,
        },
        { status: 200 },
      );
    }

    if (!parseResult.ok) {
      return NextResponse.json(
        { error: "Could not parse bank statement." },
        { status: 400 },
      );
    }

    const fileBase64 = buffer.toString("base64");

    const { autoMatched, aiSuggestions } = await persistAndMatchTransactions({
      workspaceId,
      accountId: bankAccountId,
      parsed: parseResult.transactions,
      groqApiKey,
    });

    return NextResponse.json({
      autoMatched,
      aiSuggestions,
      ignored: [],
      bankAccountId,
      parseMeta: {
        confidence: parseResult.confidence,
        headerRowIndex: parseResult.headerRowIndex,
        delimiter: parseResult.delimiter,
        encoding: parseResult.encoding,
        columnLabels: parseResult.columnLabels,
      },
      fileBase64,
      fileName: file.name,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Failed to process bank statement securely. Please check your data or API key.",
      },
      { status: 500 },
    );
  }
}
