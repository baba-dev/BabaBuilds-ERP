import { download, gstError, requireGstAccess } from "@/lib/gst/access";
import { loadGstBooks, loadGstProfile } from "@/lib/gst/data";
import { computeFyUnits, getGstOverview, getGstr9 } from "@/lib/gst/service";
import { fyBounds, fyLabel, fyStartYear, parseFyLabel } from "@/lib/gst/calendar";
import { csvText, gstr1Rows, gstr3bRows, gstr9Rows } from "@/lib/gst/exports";
import { gstr1PortalJson } from "@/lib/gst/gstr1";
import { buildZip } from "@/lib/gst/zip";
import { getGstIssues } from "@/lib/gst/issues";
import { buildTallyXml } from "@/lib/gst/tally";
import { invoicesForPeriod } from "@/lib/gst/gstr1";
import { auditGst } from "@/lib/gst/access";
import { expenseTaxable } from "@/lib/gst/books";

/** One ZIP with everything an accountant or auditor asks for: every return, registers, ITC ledger, checks and Tally XML. */
export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const fyParam = new URL(request.url).searchParams.get("fy");
  const fy = fyParam ? parseFyLabel(fyParam) : fyStartYear(new Date());
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  const { workspaceId } = auth.access;
  try {
    const profile = await loadGstProfile(workspaceId);
    const label = fyLabel(fy);
    const { fyUnits } = await computeFyUnits(profile, fy);
    const files: Array<{ name: string; data: string }> = [];
    for (const u of fyUnits) {
      files.push({ name: `GSTR1/GSTR1_${u.key}.csv`, data: csvText(gstr1Rows(u.gstr1)) });
      if (profile.gstin) files.push({ name: `GSTR1/GSTR1_${u.key}.json`, data: JSON.stringify(gstr1PortalJson(u.gstr1, profile.gstin), null, 2) });
      files.push({ name: `GSTR3B/GSTR3B_${u.key}.csv`, data: csvText(gstr3bRows(u.gstr3b)) });
    }
    const { report } = await getGstr9(workspaceId, fy);
    files.push({ name: `GSTR9/GSTR9_${label}.csv`, data: csvText(gstr9Rows(report)) });

    const range = fyBounds(fy);
    const books = await loadGstBooks(profile, range.start, range.end);
    const invoices = invoicesForPeriod(books.invoices, range.start, range.end).included;
    files.push({
      name: "registers/sales_register.csv",
      data: csvText([["Invoice", "Date", "Customer", "GSTIN", "Place of supply", "Type", "Taxable", "IGST", "CGST", "SGST", "Cess", "Total", "IRN"], ...invoices.map((i) => {
        const s = (k: "igst" | "cgst" | "sgst" | "cess") => i.lines.reduce((x, l) => x + l[k], 0);
        return [i.number, i.date.toISOString().slice(0, 10), i.clientName, i.gstin ?? "", i.placeOfSupply, i.supplyType, i.taxable, s("igst"), s("cgst"), s("sgst"), s("cess"), i.value, i.irn ?? ""];
      })]),
    });
    files.push({
      name: "registers/purchase_register.csv",
      data: csvText([["Date", "Vendor", "GSTIN", "Bill no.", "HSN", "Credit", "Held", "Claim month", "Taxable", "IGST", "CGST", "SGST", "Cess", "Total"], ...books.expenses.filter((e) => e.date >= range.start && e.date <= range.end).map((e) => [e.date.toISOString().slice(0, 10), e.vendor, e.vendorGstin ?? "", e.vendorInvoiceNo ?? "", e.hsn, e.itcStatus, e.itcHeld ? "Y" : "", e.itcClaimMonth ?? "", expenseTaxable(e), e.igst, e.cgst, e.sgst, e.cess, e.amount])]),
    });
    const overview = await getGstOverview(workspaceId, fy);
    files.push({ name: "filing_status.csv", data: csvText([["Return", "Period", "Due", "Status", "Filed on", "ARN"], ...overview.obligations.map((o) => [o.label, o.periodKey, (o.extendedDueDate ?? o.dueDate).slice(0, 10), o.status, o.filing?.filedAt ? new Date(o.filing.filedAt).toISOString().slice(0, 10) : "", o.filing?.arn ?? ""])]) });
    const issues = await getGstIssues(workspaceId);
    files.push({ name: "data_checks.csv", data: csvText([["Severity", "Check", "Detail", "Count"], ...issues.map((i) => [i.severity, i.code, i.name, i.count])]) });
    files.push({ name: "tally_import.xml", data: buildTallyXml({ company: profile.companyName || "Company", invoices, expenses: books.expenses.filter((e) => e.date >= range.start && e.date <= range.end) }) });
    files.push({ name: "README.txt", data: `GST bundle for FY ${label}\nGSTIN: ${profile.gstin ?? "not set"}\nGenerated: ${new Date().toISOString()}\n\nFigures are prepared from the books and are estimates until filed. Verify on the GST portal.\n` });

    await auditGst(auth.access, "BUNDLE_EXPORTED", { type: "GstBundle", id: label }, { files: files.length }, request);
    const zip = buildZip(files);
    return download(zip, `GST_bundle_${label}.zip`, "application/zip");
  } catch (error) {
    console.error("GST bundle export error:", error);
    return gstError(500, "EXPORT_FAILED", "Failed to build the bundle.");
  }
}
