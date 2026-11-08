import { download, gstError, requireGstAccess } from "@/lib/gst/access";
import { loadGstBooks, loadGstProfile } from "@/lib/gst/data";
import { fyBounds, fyStartYear, parseFyLabel, periodRange } from "@/lib/gst/calendar";
import { buildTallyXml } from "@/lib/gst/tally";
import { invoicesForPeriod } from "@/lib/gst/gstr1";
import { claimDate } from "@/lib/gst/books";

/** Tally Prime import XML (sales + purchase vouchers) for a month/quarter or a whole financial year. */
export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams;
  const period = q.get("period");
  const range = period ? periodRange(period) : fyBounds(q.get("fy") ? (parseFyLabel(q.get("fy")!) ?? fyStartYear(new Date())) : fyStartYear(new Date()));
  if (!range) return gstError(400, "INVALID_PERIOD", "Unknown return period.");
  const profile = await loadGstProfile(auth.access.workspaceId);
  const books = await loadGstBooks(profile, range.start, range.end);
  const invoices = invoicesForPeriod(books.invoices, range.start, range.end).included;
  const expenses = books.expenses.filter((e) => { const d = claimDate(e); return d >= range.start && d <= range.end; });
  const xml = buildTallyXml({ company: profile.companyName || "Company", invoices, expenses });
  return download(xml, `tally_${period ?? q.get("fy") ?? "year"}.xml`, "application/xml");
}
