import { NextResponse } from "next/server";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { getGstOverview } from "@/lib/gst/service";
import { fyStartYear, parseFyLabel } from "@/lib/gst/calendar";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const fyParam = new URL(request.url).searchParams.get("fy");
  const fy = fyParam ? parseFyLabel(fyParam) : fyStartYear(new Date());
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  try {
    return NextResponse.json(await getGstOverview(auth.access.workspaceId, fy, auth.access.userId));
  } catch (error) {
    console.error("GST overview error:", error);
    return gstError(500, "OVERVIEW_FAILED", "Failed to load the GST overview.");
  }
}
