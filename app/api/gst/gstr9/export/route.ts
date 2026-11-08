import { download, gstError, requireGstAccess } from "@/lib/gst/access";
import { getGstr9 } from "@/lib/gst/service";
import { fyStartYear, parseFyLabel } from "@/lib/gst/calendar";
import { csvText, gstr9Rows } from "@/lib/gst/exports";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams.get("fy");
  const fy = p ? parseFyLabel(p) : fyStartYear(new Date()) - 1;
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2025-26.");
  try {
    const { report } = await getGstr9(auth.access.workspaceId, fy);
    return download(csvText(gstr9Rows(report)), `GSTR9_${report.fy}.csv`, "text/csv");
  } catch (error) {
    console.error("GSTR-9 export error:", error);
    return gstError(500, "EXPORT_FAILED", "Failed to export GSTR-9.");
  }
}
