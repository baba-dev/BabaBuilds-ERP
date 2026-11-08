import { download, gstError, requireGstAccess, toCsv } from "@/lib/gst/access";
import { getGstr9 } from "@/lib/gst/service";
import { fyStartYear, parseFyLabel } from "@/lib/gst/calendar";

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams.get("fy");
  const fy = p ? parseFyLabel(p) : fyStartYear(new Date()) - 1;
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2025-26.");
  try {
    const { report } = await getGstr9(auth.access.workspaceId, fy);
    const rows: Array<Array<string | number>> = [["Table", "Row", "Taxable value", "IGST", "CGST", "SGST", "Cess"]];
    const add = (table: string, group: Record<string, { taxable?: number; igst: number; cgst: number; sgst: number; cess: number }>) => {
      for (const [k, v] of Object.entries(group)) rows.push([table, k.toUpperCase(), v.taxable ?? "", v.igst, v.cgst, v.sgst, v.cess]);
    };
    add("4", report.t4);
    add("5", report.t5);
    add("6", report.t6);
    add("7", report.t7);
    rows.push(["8", "2B", "", report.t8.as2b.igst, report.t8.as2b.cgst, report.t8.as2b.sgst, report.t8.as2b.cess]);
    rows.push(["8", "BOOKS", "", report.t8.asBooks.igst, report.t8.asBooks.cgst, report.t8.asBooks.sgst, report.t8.asBooks.cess]);
    for (const h of report.t9) rows.push(["9", h.head, "", h.payable, h.cash, h.itc, ""]);
    add("10-16", report.manual);
    for (const h of report.t17) rows.push(["17", `${h.hsn} @${h.rate}%`, h.taxable, h.igst, h.cgst, h.sgst, h.cess]);
    for (const h of report.t18) rows.push(["18", `${h.hsn} @${h.rate}%`, h.taxable, h.igst, h.cgst, h.sgst, h.cess]);
    return download(toCsv(rows), `GSTR9_${report.fy}.csv`, "text/csv");
  } catch (error) {
    console.error("GSTR-9 export error:", error);
    return gstError(500, "EXPORT_FAILED", "Failed to export GSTR-9.");
  }
}
