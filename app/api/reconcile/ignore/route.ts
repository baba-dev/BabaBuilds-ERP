import { NextResponse } from "next/server";
import { z } from "zod";
import { reconError, requireReconAccess } from "@/lib/reconciliation/access";
import { setIgnored } from "@/lib/reconciliation/workspace";

/** Keep lines out of the inbox ("no match needed") or bring them back. Saved, so they do not return on the next visit. */
export async function POST(request: Request) {
  const auth = await requireReconAccess("reconciliation.commit");
  if (!auth.ok) return auth.response;
  const parsed = z.object({ ids: z.array(z.string().min(1)).min(1).max(500), ignored: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reconError(400, "INVALID_BODY", "Choose bank lines and whether to ignore or restore them.");
  const updated = await setIgnored(auth.ctx, parsed.data.ids, parsed.data.ignored);
  return NextResponse.json({ success: true, updated });
}
