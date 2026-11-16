import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { encrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/reconciliation/plaid-client";

export async function POST(request: Request) {
  const access = await requireReconAccess("reconciliation.commit");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const body = await request.json().catch(() => null);
  const publicToken = typeof body?.publicToken === "string" ? body.publicToken : "";
  const bankAccountId =
    typeof body?.bankAccountId === "string" ? body.bankAccountId : "";

  if (!publicToken || !bankAccountId) {
    return NextResponse.json(
      { error: "publicToken and bankAccountId are required." },
      { status: 400 },
    );
  }

  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, workspaceId },
  });
  if (!account) return NextResponse.json({ error: "Bank account not found." }, { status: 404 });

  const plaid = getPlaidClient();
  if (!plaid) {
    return NextResponse.json({ error: "Plaid not configured." }, { status: 503 });
  }

  try {
    const exchange = await plaid.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const accounts = await plaid.accountsGet({ access_token: accessToken });
    const firstPlaidAcct = accounts.data.accounts[0];

    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        plaidItemId: itemId,
        plaidAccountId: firstPlaidAcct?.account_id ?? null,
        plaidAccessTokenEncrypted: encrypt(accessToken),
      },
    });

    return NextResponse.json({
      ok: true,
      itemId,
      plaidAccountId: firstPlaidAcct?.account_id ?? null,
    });
  } catch (e) {
    console.error("plaid exchange", e);
    return NextResponse.json({ error: "Plaid token exchange failed." }, { status: 500 });
  }
}
