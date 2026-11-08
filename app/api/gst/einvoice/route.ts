import { NextResponse } from "next/server";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { getEInvoiceRegister } from "@/lib/gst/insights";
import { fyLabel, fyStartYear, parseFyLabel } from "@/lib/gst/calendar";

/** Invoices that need an IRN and/or an e-way bill, with reporting status. */
export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams.get("fy");
  const fy = p ? parseFyLabel(p) : fyStartYear(new Date());
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  try {
    return NextResponse.json(await getEInvoiceRegister(auth.access.workspaceId, fyLabel(fy)));
  } catch (error) {
    console.error("e-invoice register error:", error);
    return gstError(500, "REGISTER_FAILED", "Failed to load the e-invoice register.");
  }
}
