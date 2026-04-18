import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Stub: Plaid integration requires PLAID_CLIENT_ID / PLAID_SECRET and Link flow in UI.
 * Returns disabled until provider is configured.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.workspaceReconciliationSettings.findUnique({
    where: { workspaceId },
  });
  const provider = settings?.bankFeedProvider ?? "NONE";
  if (provider !== "PLAID") {
    return NextResponse.json(
      {
        enabled: false,
        message:
          "Set bankFeedProvider to PLAID in reconciliation settings and configure Plaid keys on the server.",
      },
      { status: 200 },
    );
  }

  const hasKeys = Boolean(
    process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim(),
  );
  if (!hasKeys) {
    return NextResponse.json(
      { enabled: false, message: "Plaid is not configured (missing PLAID_CLIENT_ID / PLAID_SECRET)." },
      { status: 200 },
    );
  }

  return NextResponse.json({
    enabled: false,
    message: "Plaid Link token generation is not implemented in this build; use file import.",
  });
}
