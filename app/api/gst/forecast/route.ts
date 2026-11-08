import { NextResponse } from "next/server";
import { z } from "zod";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { getGstCashOutflows, runWhatIf } from "@/lib/gst/insights";

/** Cash GST due over the next ~four months, for the cash-flow view and the Tools tab. */
export async function GET() {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const now = new Date();
  const items = await getGstCashOutflows(auth.access.workspaceId, new Date(now.getTime() - 40 * 86400000), new Date(now.getTime() + 120 * 86400000));
  return NextResponse.json({ items: items.map((i) => ({ ...i, dueDate: i.dueDate.toISOString() })) });
}

const schema = z.object({
  periodKey: z.string().min(6).max(10),
  amount: z.number().finite().positive().max(1e10),
  rate: z.number().finite().min(0).max(100),
  interState: z.boolean(),
  itcStatus: z.enum(["ELIGIBLE", "REVERSE_CHARGE"]).default("ELIGIBLE"),
});

/** What-if: how one planned purchase moves a period's cash GST. */
export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the amount and rate.");
  const result = await runWhatIf(auth.access.workspaceId, body.data);
  if (!result) return gstError(404, "PERIOD_NOT_FOUND", "That return period does not exist for your filing frequency.");
  return NextResponse.json(result);
}
