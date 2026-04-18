import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeBankRowImportHash } from "@/lib/reconciliation/bank-import-hash";
import { rankInvoiceMatchesForCredit } from "@/lib/reconciliation/invoice-match";
import type { ParsedBankTransaction } from "@/lib/reconciliation/bank-csv-parse";

export interface UploadTxn {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  reference?: string;
}

interface GroqSuggestion {
  id: string;
  aiCategory: string;
  aiVendor: string;
  reason: string;
}

const sanitizeDescription = (desc: string) => {
  if (!desc) return "Unknown";
  return desc.replace(/\b\d{10,}\b/g, "[REDACTED]");
};

export const robustJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const startIndex = cleaned.indexOf("{");
      const endIndex = cleaned.lastIndexOf("}");
      if (startIndex !== -1 && endIndex !== -1) {
        const extracted = cleaned.substring(startIndex, endIndex + 1);
        return JSON.parse(extracted);
      }
      return null;
    } catch {
      const match = text.match(/\[([\s\S]*)\]/);
      if (match) {
        try {
          return JSON.parse(`{"suggestions": [${match[1].replace(/,\s*$/, "")}]}`);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
};

const AUTO_MATCH_MIN_SCORE = 95;

function toUploadTxns(parsed: ParsedBankTransaction[]): UploadTxn[] {
  return parsed.map((t, i) => ({
    id: t.id ?? `txn_${i}`,
    date: t.date,
    description: t.description,
    amount: t.amount,
    type: t.type,
    reference: t.reference,
  }));
}

export type AutoMatchedRow = UploadTxn & {
  matchType: string;
  matchId: string;
  confidence: number;
  bankTransactionId?: string;
};

export async function persistAndMatchTransactions(args: {
  workspaceId: string;
  accountId: string;
  parsed: ParsedBankTransaction[];
  groqApiKey: string | null;
}): Promise<{
  autoMatched: AutoMatchedRow[];
  aiSuggestions: Array<UploadTxn & Partial<GroqSuggestion>>;
}> {
  const { workspaceId, accountId, groqApiKey } = args;
  const parsed = toUploadTxns(args.parsed);

  const pendingInvoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
    },
  });

  const createdRows: Array<{
    dbId: string;
    txn: UploadTxn;
    match?: { invoiceNumber: string; score: number };
  }> = [];

  for (let i = 0; i < parsed.length; i++) {
    const txn = parsed[i];
    const bankDate = new Date(txn.date);
    const signed =
      txn.type === "DEBIT" ? -Math.abs(txn.amount) : Math.abs(txn.amount);
    const hash = computeBankRowImportHash({
      workspaceId,
      accountId,
      dateIso: bankDate.toISOString().slice(0, 10),
      amountSigned: signed.toFixed(2),
      description: txn.description,
      reference: txn.reference,
    });

    const existing = await prisma.bankTransaction.findFirst({
      where: {
        workspaceId,
        accountId,
        sourceImportHash: hash,
      },
    });

    let dbRow = existing;
    if (!dbRow) {
      dbRow = await prisma.bankTransaction.create({
        data: {
          workspaceId,
          accountId,
          date: bankDate,
          description: txn.description.slice(0, 2000),
          amount: new Prisma.Decimal(signed),
          referenceId: txn.reference?.slice(0, 512) ?? null,
          transactionType: txn.type,
          sourceImportHash: hash,
          isReconciled: false,
        },
      });
    }

    // Re-import of the same row: skip auto-invoice matching to avoid paying the same invoice twice.
    const isDedupedImport = Boolean(existing);

    let match: { invoiceNumber: string; score: number } | undefined;
    if (txn.type === "CREDIT" && !isDedupedImport) {
      const ranked = rankInvoiceMatchesForCredit({
        invoices: pendingInvoices,
        amount: txn.amount,
        bankDate,
        narration: txn.description,
        reference: txn.reference,
      });
      const top = ranked[0];
      if (top && top.score >= AUTO_MATCH_MIN_SCORE) {
        match = {
          invoiceNumber: top.invoice.invoiceNumber,
          score: top.score,
        };
        const idx = pendingInvoices.findIndex((inv) => inv.id === top.invoice.id);
        if (idx !== -1) pendingInvoices.splice(idx, 1);
      }
    }

    createdRows.push({
      dbId: dbRow.id,
      txn: { ...txn, id: dbRow.id },
      match,
    });
  }

  const autoMatched: AutoMatchedRow[] = [];
  const unresolvedTransactions: UploadTxn[] = [];

  for (const row of createdRows) {
    const txn = row.txn;
    if (txn.type === "CREDIT" && row.match) {
      autoMatched.push({
        ...txn,
        matchType: "INVOICE",
        matchId: row.match.invoiceNumber,
        confidence: Math.min(100, row.match.score),
        bankTransactionId: row.dbId,
      });
    } else {
      unresolvedTransactions.push(txn);
    }
  }

  let aiSuggestions: Array<UploadTxn & Partial<GroqSuggestion>> = [];

  if (unresolvedTransactions.length > 0 && groqApiKey) {
    const groq = new Groq({ apiKey: groqApiKey });
    const systemPrompt = `You are an elite forensic accountant for an Indian business.
      I will provide you with a JSON array of unresolved bank transactions.
      Analyze the 'description' field and categorize the expense or income.
      
      For DEBITS (money out), suggest an 'aiCategory' (e.g., Software, Meals, Bank Fees) and 'aiVendor'.
      For CREDITS (money in), suggest if it's a 'Refund', 'Uncategorized Income', or 'Capital Injection'.
      
      Example output format:
      {"suggestions": [{"id": "txn_1", "aiCategory": "Software", "aiVendor": "AWS", "reason": "Cloud hosting"}]}
      
      You MUST respond in strictly valid JSON format matching this schema:
      {
        "suggestions": [
          {
            "id": "String",
            "aiCategory": "String",
            "aiVendor": "String",
            "reason": "String"
          }
        ]
      }`;

    const CHUNK_SIZE = 40;
    let allGroqSuggestions: GroqSuggestion[] = [];
    const MAX_RETRIES = 1;

    for (let i = 0; i < unresolvedTransactions.length; i += CHUNK_SIZE) {
      const chunk = unresolvedTransactions.slice(i, i + CHUNK_SIZE);
      const optimizedChunk = chunk.map((t) => ({
        id: t.id,
        description: sanitizeDescription(t.description),
        type: t.type,
      }));

      let chunkSuccess = false;
      let attempts = 0;

      while (!chunkSuccess && attempts <= MAX_RETRIES) {
        try {
          attempts++;
          const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify(optimizedChunk) },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          });

          const rawContent = completion.choices[0].message.content || "{}";
          const groqResponse = robustJsonParse(rawContent);

          if (
            groqResponse &&
            groqResponse.suggestions &&
            Array.isArray(groqResponse.suggestions)
          ) {
            allGroqSuggestions = [...allGroqSuggestions, ...groqResponse.suggestions];
            chunkSuccess = true;
          } else {
            throw new Error("Parsed JSON did not match expected schema.");
          }
        } catch (chunkError) {
          console.warn(`Chunk ${i} failed on attempt ${attempts}.`, chunkError);
          if (attempts > MAX_RETRIES) {
            console.error(`Giving up on chunk ${i} after ${attempts} attempts.`);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    }

    aiSuggestions = unresolvedTransactions.map((txn) => {
      const suggestion = allGroqSuggestions.find((s) => s.id === txn.id);
      return suggestion
        ? { ...txn, ...suggestion }
        : {
            ...txn,
            aiCategory: "Uncategorized",
            aiVendor: "Unknown",
            reason: "Pending manual review.",
          };
    });
  } else if (unresolvedTransactions.length > 0) {
    aiSuggestions = unresolvedTransactions.map((txn) => ({
      ...txn,
      aiCategory: "Uncategorized",
      aiVendor: "Unknown",
      reason: "Configure Groq API key for AI categorization.",
    }));
  }

  return { autoMatched, aiSuggestions };
}
