import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/reconciliation/plaid-client";
import { plaidTransactionToParsed } from "@/lib/reconciliation/plaid-sync";
import { persistAndMatchTransactions } from "@/lib/reconciliation/run-reconciliation-upload";
import { getOrCreateReconciliationSettings } from "@/lib/reconciliation/reconciliation-settings";

export async function POST(request: Request) {
  const access = await requireReconAccess("reconciliation.commit");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const body = await request.json().catch(() => null);
  const bankAccountId =
    typeof body?.bankAccountId === "string" ? body.bankAccountId : "";

  if (!bankAccountId) {
    return NextResponse.json({ error: "bankAccountId required." }, { status: 400 });
  }

  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, workspaceId },
  });
  if (!account?.plaidAccessTokenEncrypted) {
    return NextResponse.json(
      { error: "Connect Plaid for this bank account first." },
      { status: 400 },
    );
  }

  const plaid = getPlaidClient();
  if (!plaid) {
    return NextResponse.json({ error: "Plaid not configured." }, { status: 503 });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(account.plaidAccessTokenEncrypted);
  } catch {
    accessToken = account.plaidAccessTokenEncrypted;
  }

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

  try {
    let cursor = account.plaidTransactionsCursor ?? undefined;
    const parsedLines: ReturnType<typeof plaidTransactionToParsed>[] = [];

    for (;;) {
      const sync = await plaid.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? undefined,
      });
      const data = sync.data;
      for (const t of data.added ?? []) {
        if (account.plaidAccountId && t.account_id !== account.plaidAccountId) {
          continue;
        }
        parsedLines.push(
          plaidTransactionToParsed({
            transaction_id: t.transaction_id,
            date: t.date ?? "",
            name: t.name ?? "",
            amount: t.amount ?? 0,
            iso_currency_code: t.iso_currency_code,
            unofficial_currency_code: t.unofficial_currency_code,
          }),
        );
      }
      cursor = data.next_cursor ?? null;
      if (!data.has_more) break;
    }

    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        plaidTransactionsCursor: cursor ?? undefined,
        lastPlaidSyncAt: new Date(),
      },
    });

    const batch = await prisma.bankImportBatch.create({
      data: {
        workspaceId,
        accountId: bankAccountId,
        fileName: "plaid-sync",
        mimeType: "application/vnd.plaid.transactions",
        status: "COMPLETED",
        parseVersion: "plaid-1",
        parseMeta: { source: "PLAID", rowCount: parsedLines.length },
      },
    });

    if (parsedLines.length === 0) {
      return NextResponse.json({
        ok: true,
        imported: 0,
        message: "No new transactions from Plaid.",
      });
    }

    const result = await persistAndMatchTransactions({
      workspaceId,
      accountId: bankAccountId,
      parsed: parsedLines,
      groqApiKey,
      settings,
      importBatchId: batch.id,
    });

    return NextResponse.json({
      ok: true,
      imported: parsedLines.length,
      autoMatched: result.autoMatched.length,
      aiSuggestions: result.aiSuggestions.length,
    });
  } catch (e) {
    console.error("plaid sync", e);
    return NextResponse.json({ error: "Plaid sync failed." }, { status: 500 });
  }
}
