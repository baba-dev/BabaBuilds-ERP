import { NextResponse } from "next/server";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { reconciliationSummary } from "@/lib/reconciliation/workspace";

export async function GET(request: Request) {
  const auth = await requireReconAccess("reconciliation.import");
  if (!auth.ok) return auth.response;
  const accountId = new URL(request.url).searchParams.get("accountId") || undefined;
  const canCommit = (await requireReconAccess("reconciliation.commit")).ok;
  return NextResponse.json({ data: { ...(await reconciliationSummary(auth.ctx.workspaceId, accountId)), canCommit } }, { headers: { "Cache-Control": "no-store" } });
}
