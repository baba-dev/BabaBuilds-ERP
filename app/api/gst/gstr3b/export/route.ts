import { download, gstError, requireGstAccess } from "@/lib/gst/access";
import { getUnit } from "@/lib/gst/service";
import { csvText, gstr3bRows } from "@/lib/gst/exports";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const period = new URL(request.url).searchParams.get("period") ?? "";
  try {
    const { unit } = await getUnit(auth.access.workspaceId, period);
    if (!unit) return gstError(404, "PERIOD_NOT_FOUND", "That return period does not exist for your filing frequency.");
    return download(csvText(gstr3bRows(unit.gstr3b)), `GSTR3B_${period}.csv`, "text/csv");
  } catch (error) {
    console.error("GSTR-3B export error:", error);
    return gstError(500, "EXPORT_FAILED", "Failed to export GSTR-3B.");
  }
}
