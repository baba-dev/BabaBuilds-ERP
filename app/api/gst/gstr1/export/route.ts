import { download, gstError, requireGstAccess, toCsv } from "@/lib/gst/access";
import { gstr1Export, getUnit } from "@/lib/gst/service";
import { stateName } from "@/lib/gst/states";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  try {
    const { unit, profile } = await getUnit(auth.access.workspaceId, period);
    if (!unit) return gstError(404, "PERIOD_NOT_FOUND", "That return period does not exist for your filing frequency.");
    if (format === "json") {
      if (!profile.gstin) return gstError(409, "GSTIN_REQUIRED", "Add your GSTIN in GST settings before exporting for the portal.");
      return download(JSON.stringify(gstr1Export(profile, unit), null, 2), `GSTR1_${profile.gstin}_${period}.json`, "application/json");
    }
    const r = unit.gstr1;
    const rows: Array<Array<string | number>> = [["Section", "Document", "Date", "Party", "GSTIN", "Place of supply", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Invoice value"]];
    const push = (section: string, doc: { number: string; date: string; pos: string; value: number; lines: Array<{ rate: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number }> }, party: string, gstin: string) => {
      for (const l of doc.lines) rows.push([section, doc.number, doc.date, party, gstin, stateName(doc.pos) || doc.pos, l.rate, l.taxable, l.igst, l.cgst, l.sgst, l.cess, doc.value]);
    };
    for (const p of r.b2b) for (const i of p.invoices) push(i.rcm ? "4B B2B (reverse charge)" : "4A B2B", i, p.name, p.gstin);
    for (const i of r.b2cl) push("5 B2C large", i, "", "");
    for (const s of r.b2cs) rows.push(["7 B2C small", "", "", "", "", stateName(s.pos), s.rate, s.taxable, s.igst, s.cgst, s.sgst, s.cess, ""]);
    for (const i of r.exports) push(i.supplyType === "EXPWP" ? "6A Export (with payment)" : "6A Export (LUT)", i, "", "");
    for (const p of r.cdnr) for (const n of p.notes) push("9B Credit note (registered)", n, p.name, p.gstin);
    for (const n of r.cdnur) push("9B Credit note (unregistered)", n, "", "");
    for (const n of r.nil) rows.push([`8 Nil/exempt ${n.key.replace("_", " ")}`, "", "", "", "", "", 0, n.nil + n.exempt + n.nonGst, 0, 0, 0, 0, ""]);
    return download(toCsv(rows), `GSTR1_${period}.csv`, "text/csv");
  } catch (error) {
    console.error("GSTR-1 export error:", error);
    return gstError(500, "EXPORT_FAILED", "Failed to export GSTR-1.");
  }
}
