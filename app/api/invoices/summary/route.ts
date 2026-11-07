import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { getInvoiceSummary } from "@/lib/invoices/summary";

const querySchema = z.object({
  fy: z.string().trim().regex(/^\d{2}-\d{2}$/).optional(),
  from: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v))).optional(),
  to: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v))).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireInvoiceAccess("invoices.view");
    if (!auth.ok) return auth.response;

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiError(400, "INVALID_QUERY", "Invalid period.");

    const summary = await getInvoiceSummary(auth.access.workspaceId, {
      fy: parsed.data.fy,
      from: parsed.data.from ? new Date(parsed.data.from) : null,
      to: parsed.data.to ? new Date(parsed.data.to) : null,
    });
    return NextResponse.json({ data: summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("API Error computing invoice summary:", error);
    return apiError(500, "INVOICE_SUMMARY_FAILED", "Failed to compute invoice summary.");
  }
}
