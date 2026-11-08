import { NextResponse } from "next/server";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { getGstIssues } from "@/lib/gst/issues";

export async function GET() {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ issues: await getGstIssues(auth.access.workspaceId) });
  } catch (error) {
    console.error("GST issues error:", error);
    return gstError(500, "ISSUES_FAILED", "Failed to check your GST data.");
  }
}
