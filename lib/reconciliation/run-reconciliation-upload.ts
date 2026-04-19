import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeBankRowImportHash } from "@/lib/reconciliation/bank-import-hash";
import { rankInvoiceMatchesForCredit } from "@/lib/reconciliation/invoice-match";
import { rankExpenseMatchesForDebit } from "@/lib/reconciliation/expense-match";
import { rankPurchaseOrdersForDebit } from "@/lib/reconciliation/po-match";
import type { ParsedBankTransaction } from "@/lib/reconciliation/bank-csv-parse";
import { annotateRunningBalanceContinuity } from "@/lib/reconciliation/balance-validate";
import {
  applyReconciliationRules,
  type BankRuleRow,
  type RuleAugmentedTxn,
} from "@/lib/reconciliation/reconciliation-rules";
import type { ReconciliationSettingsDTO } from "@/lib/reconciliation/reconciliation-settings";

export interface UploadTxn {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  reference?: string;
  ruleCategory?: string;
  ruleVendor?: string;
  invoiceMatchCandidates?: Array<{
    invoiceNumber: string;
    score: number;
    reasons: string[];
  }>;
  expenseMatchCandidates?: Array<{
    expenseId: string;
    vendor: string;
    score: number;
    reasons: string[];
  }>;
  poMatchCandidates?: Array<{
    poNumber: string;
    score: number;
    reasons: string[];
  }>;
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

export type AutoMatchedRow = UploadTxn & {
  matchType: string;
  matchId: string;
  confidence: number;
  bankTransactionId?: string;
};

export type PersistAndMatchArgs = {
  workspaceId: string;
  accountId: string;
  parsed: ParsedBankTransaction[];
  groqApiKey: string | null;
  settings: ReconciliationSettingsDTO;
  importBatchId?: string | null;
};

export async function persistAndMatchTransactions(
  args: PersistAndMatchArgs,
): Promise<{
  autoMatched: AutoMatchedRow[];
  aiSuggestions: Array<UploadTxn & Partial<GroqSuggestion>>;
}> {
  const { workspaceId, accountId, groqApiKey, settings, importBatchId } = args;

  const rules = await prisma.bankReconciliationRule.findMany({
    where: { workspaceId, isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  const ruleRows: BankRuleRow[] = rules.map((r) => ({
    priority: r.priority,
    pattern: r.pattern,
    matchTxnType: r.matchTxnType,
    setCategory: r.setCategory,
    setVendor: r.setVendor,
    setInternalTransfer: r.setInternalTransfer,
  }));

  let augmented = applyReconciliationRules(args.parsed, ruleRows);
  augmented = annotateRunningBalanceContinuity(augmented);

  const pendingInvoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
    },
  });

  const recentExpenses = await prisma.expense.findMany({
    where: { workspaceId },
    orderBy: { date: "desc" },
    take: 500,
  });

  const openPos = await prisma.purchaseOrder.findMany({
    where: {
      workspaceId,
      status: { in: ["SENT", "DELIVERED"] },
    },
    take: 200,
  });

  type RowWork = {
    parsed: RuleAugmentedTxn;
    hash: string;
    bankDate: Date;
    signed: number;
  };

  const works: RowWork[] = augmented.map((t) => {
    const bankDate = new Date(t.date);
    const signed =
      t.type === "DEBIT" ? -Math.abs(t.amount) : Math.abs(t.amount);
    const hash = computeBankRowImportHash({
      workspaceId,
      accountId,
      dateIso: bankDate.toISOString().slice(0, 10),
      amountSigned: signed.toFixed(2),
      description: t.description,
      reference: t.reference,
      providerTransactionId: t.providerTransactionId,
    });
    return { parsed: t, hash, bankDate, signed };
  });

  const hashes = [...new Set(works.map((w) => w.hash))];

  const existingRows = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      accountId,
      sourceImportHash: { in: hashes },
    },
    select: { id: true, sourceImportHash: true },
  });
  const existingByHash = new Map(
    existingRows
      .filter((e) => e.sourceImportHash)
      .map((e) => [e.sourceImportHash as string, e.id]),
  );

  const seenNew = new Set<string>();
  const toInsert = works.filter((w) => {
    if (existingByHash.has(w.hash)) return false;
    if (seenNew.has(w.hash)) return false;
    seenNew.add(w.hash);
    return true;
  });

  if (toInsert.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const w of toInsert) {
        await tx.bankTransaction.create({
          data: {
            workspaceId,
            accountId,
            importBatchId: importBatchId ?? undefined,
            date: w.bankDate,
            description: w.parsed.description.slice(0, 2000),
            amount: new Prisma.Decimal(w.signed),
            referenceId: w.parsed.reference?.slice(0, 512) ?? null,
            transactionType: w.parsed.type,
            sourceImportHash: w.hash,
            providerTransactionId:
              w.parsed.providerTransactionId?.slice(0, 512) ?? null,
            isReconciled: false,
            balanceAfter:
              w.parsed.balanceAfter != null
                ? new Prisma.Decimal(w.parsed.balanceAfter)
                : null,
            originalCurrency: w.parsed.originalCurrency ?? null,
            amountOriginalCurrency:
              w.parsed.amountOriginalCurrency != null
                ? new Prisma.Decimal(w.parsed.amountOriginalCurrency)
                : null,
            parseFlagsJson: (w.parsed.parseFlags ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            category: w.parsed.ruleCategory ?? null,
            isInternalTransfer: Boolean(w.parsed.ruleInternalTransfer),
          },
        });
      }
    });
  }

  const dbRows = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      accountId,
      sourceImportHash: { in: hashes },
    },
    select: {
      id: true,
      sourceImportHash: true,
    },
  });
  const idByHash = new Map(
    dbRows
      .filter((r) => r.sourceImportHash)
      .map((r) => [r.sourceImportHash as string, r.id]),
  );

  const autoMin = settings.autoMatchMinScore;
  const suggestMin = settings.autoMatchSuggestionMin;

  const autoMatched: AutoMatchedRow[] = [];
  const unresolvedForAi: UploadTxn[] = [];

  const invoicePool = [...pendingInvoices];

  for (const w of works) {
    const dbId = idByHash.get(w.hash)!;
    const wasDeduped = existingByHash.has(w.hash);
    const txnBase: UploadTxn = {
      id: dbId,
      date: w.parsed.date,
      description: w.parsed.description,
      amount: w.parsed.amount,
      type: w.parsed.type,
      reference: w.parsed.reference,
      ruleCategory: w.parsed.ruleCategory,
      ruleVendor: w.parsed.ruleVendor,
    };

    if (w.parsed.type === "CREDIT" && !wasDeduped) {
      const ranked = rankInvoiceMatchesForCredit({
        invoices: invoicePool,
        amount: w.parsed.amount,
        bankDate: w.bankDate,
        narration: w.parsed.description,
        reference: w.parsed.reference,
      });
      const top = ranked[0];
      if (top && top.score >= autoMin) {
        autoMatched.push({
          ...txnBase,
          matchType: "INVOICE",
          matchId: top.invoice.invoiceNumber,
          confidence: Math.min(100, top.score),
          bankTransactionId: dbId,
        });
        const idx = invoicePool.findIndex((inv) => inv.id === top.invoice.id);
        if (idx !== -1) invoicePool.splice(idx, 1);
        continue;
      }
      const candidates = ranked.slice(0, 3).map((c) => ({
        invoiceNumber: c.invoice.invoiceNumber,
        score: c.score,
        reasons: c.reasons,
      }));
      if (top && top.score >= suggestMin) {
        unresolvedForAi.push({
          ...txnBase,
          invoiceMatchCandidates: candidates,
        });
        continue;
      }
      if (candidates.some((c) => c.score > 0)) {
        unresolvedForAi.push({
          ...txnBase,
          invoiceMatchCandidates: candidates,
        });
        continue;
      }
    }

    if (w.parsed.type === "DEBIT" && !wasDeduped) {
      const expRanked = rankExpenseMatchesForDebit({
        expenses: recentExpenses,
        amount: w.parsed.amount,
        narration: w.parsed.description,
      });
      const poRanked = rankPurchaseOrdersForDebit({
        orders: openPos,
        amount: w.parsed.amount,
        narration: w.parsed.description,
      });
      unresolvedForAi.push({
        ...txnBase,
        expenseMatchCandidates: expRanked.map((e) => ({
          expenseId: e.expense.id,
          vendor: e.expense.vendor,
          score: e.score,
          reasons: e.reasons,
        })),
        poMatchCandidates: poRanked.map((p) => ({
          poNumber: p.purchaseOrder.poNumber,
          score: p.score,
          reasons: p.reasons,
        })),
      });
      continue;
    }

    unresolvedForAi.push(txnBase);
  }

  let aiSuggestions: Array<UploadTxn & Partial<GroqSuggestion>> = [];

  if (unresolvedForAi.length > 0 && groqApiKey) {
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

    for (let i = 0; i < unresolvedForAi.length; i += CHUNK_SIZE) {
      const chunk = unresolvedForAi.slice(i, i + CHUNK_SIZE);
      const optimizedChunk = chunk.map((t) => ({
        id: t.id,
        description: sanitizeDescription(t.description),
        type: t.type,
        hints: {
          invoiceOptions: t.invoiceMatchCandidates?.slice(0, 3),
          expenseDuplicates: t.expenseMatchCandidates?.slice(0, 2),
          poHints: t.poMatchCandidates?.slice(0, 2),
        },
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

    aiSuggestions = unresolvedForAi.map((txn) => {
      const suggestion = allGroqSuggestions.find((s) => s.id === txn.id);
      const ruleCat = txn.ruleCategory;
      const ruleVendor = txn.ruleVendor;
      const base = suggestion
        ? { ...txn, ...suggestion }
        : {
            ...txn,
            aiCategory: ruleCat || "Uncategorized",
            aiVendor: ruleVendor || "Unknown",
            reason: "Pending manual review.",
          };
      return {
        ...base,
        aiCategory: base.aiCategory || ruleCat || "Uncategorized",
        aiVendor: base.aiVendor || ruleVendor || "Unknown",
      };
    });
  } else if (unresolvedForAi.length > 0) {
    aiSuggestions = unresolvedForAi.map((txn) => ({
      ...txn,
      aiCategory: txn.ruleCategory || "Uncategorized",
      aiVendor: txn.ruleVendor || "Unknown",
      reason: "Configure Groq API key for AI categorization.",
    }));
  }

  return { autoMatched, aiSuggestions };
}
