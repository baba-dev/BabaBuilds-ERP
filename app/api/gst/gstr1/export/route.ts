import { download, gstError, requireGstAccess } from "@/lib/gst/access";
import { auditGst } from "@/lib/gst/access";
import { getUnit, gstr1Export } from "@/lib/gst/service";
import { csvText, gstr1Rows } from "@/lib/gst/exports";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  try {
    const { unit, profile } = await getUnit(auth.access.workspaceId, period);
    if (!unit) return gstError(404, "PERIOD_NOT_FOUND", "That return period does not exist for your filing frequency.");
    await auditGst(auth.access, "GSTR1_EXPORTED", { type: "GstReturn", id: `GSTR1:${period}` }, { format }, request);
    if (format === "json") {
      if (!profile.gstin) return gstError(409, "GSTIN_REQUIRED", "Add your GSTIN in GST settings before exporting for the portal.");
      return download(JSON.stringify(gstr1Export(profile, unit), null, 2), `GSTR1_${profile.gstin}_${period}.json`, "application/json");
    }
    return download(csvText(gstr1Rows(unit.gstr1)), `GSTR1_${period}.csv`, "text/csv");
  } catch (error) {
    console.error("GSTR-1 export error:", error);
    return gstError(500, "EXPORT_FAILED", "Failed to export GSTR-1.");
  }
}
