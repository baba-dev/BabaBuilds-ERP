import { NextResponse } from "next/server";
import { reconError, requireReconAccess } from "@/lib/reconciliation/access";
import { reconciliationQueue } from "@/lib/reconciliation/workspace";

/** Bank lines still waiting for a decision, with their best matches. Survives leaving the page: nothing here lives in the browser. */
export async function GET(request: Request) {
  const auth = await requireReconAccess("reconciliation.import");
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  const limit = sp.get("limit") === null ? undefined : Number(sp.get("limit"));
  const offset = sp.get("offset") === null ? undefined : Number(sp.get("offset"));
  if ((limit !== undefined && !Number.isFinite(limit)) || (offset !== undefined && !Number.isFinite(offset))) return reconError(400, "INVALID_PARAMS", "Invalid paging parameters.");
  const dir = sp.get("direction");
  const view = sp.get("view");
  const result = await reconciliationQueue(auth.ctx.workspaceId, { accountId: sp.get("accountId") || undefined, direction: dir === "debit" || dir === "credit" ? dir : undefined, q: sp.get("q") ?? undefined, view: view === "ignored" || view === "transfers" ? view : "waiting", limit, offset });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
