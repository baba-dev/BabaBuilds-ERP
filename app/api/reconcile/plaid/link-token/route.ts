import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Products, CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/reconciliation/plaid-client";

export async function POST() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.workspaceReconciliationSettings.findUnique({
    where: { workspaceId },
  });
  if ((settings?.bankFeedProvider ?? "NONE") !== "PLAID") {
    return NextResponse.json(
      {
        enabled: false,
        message: "Set bank feed to Plaid in Reconciliation settings first.",
      },
      { status: 200 },
    );
  }

  const plaid = getPlaidClient();
  if (!plaid) {
    return NextResponse.json(
      { enabled: false, message: "Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET)." },
      { status: 200 },
    );
  }

  try {
    const res = await plaid.linkTokenCreate({
      user: { client_user_id: workspaceId },
      client_name: "BabaBuilds ERP",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us, CountryCode.Ca],
      language: "en",
    });

    return NextResponse.json({
      enabled: true,
      linkToken: res.data.link_token,
    });
  } catch (e) {
    console.error("plaid linkTokenCreate", e);
    return NextResponse.json(
      { error: "Failed to create Plaid Link token." },
      { status: 500 },
    );
  }
}
