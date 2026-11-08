import { NextResponse } from "next/server";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { getUnit } from "@/lib/gst/service";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const period = new URL(request.url).searchParams.get("period") ?? "";
  try {
    const { unit, profile } = await getUnit(auth.access.workspaceId, period);
    if (!unit) return gstError(404, "PERIOD_NOT_FOUND", "That return period does not exist for your filing frequency.");
    return NextResponse.json({ report: unit.gstr3b, gstin: profile.gstin, invoiceCount: unit.gstr1.summary.invoiceCount });
  } catch (error) {
    console.error("GSTR-3B error:", error);
    return gstError(500, "GSTR3B_FAILED", "Failed to prepare GSTR-3B.");
  }
}
