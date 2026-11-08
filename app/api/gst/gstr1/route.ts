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
    return NextResponse.json({ report: unit.gstr1, gstin: profile.gstin, stateCode: profile.stateCode, prevTurnover: profile.prevTurnover });
  } catch (error) {
    console.error("GSTR-1 error:", error);
    return gstError(500, "GSTR1_FAILED", "Failed to prepare GSTR-1.");
  }
}
