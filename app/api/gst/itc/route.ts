import { NextResponse } from "next/server";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { computeFyUnits } from "@/lib/gst/service";
import { fyStartYear, parseFyLabel } from "@/lib/gst/calendar";
import { loadGstProfile } from "@/lib/gst/data";
import { totalTax } from "@/lib/gst/money";

/** Electronic credit ledger by filing period: opening, credit added, reversed, utilised, closing. */
export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const fyParam = new URL(request.url).searchParams.get("fy");
  const fy = fyParam ? parseFyLabel(fyParam) : fyStartYear(new Date());
  if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  try {
    const profile = await loadGstProfile(auth.access.workspaceId);
    const { fyUnits, books } = await computeFyUnits(profile, fy);
    const periods = fyUnits.map((u) => {
      const p = u.gstr3b.payment;
      return {
        key: u.key,
        opening: { ...p.openingItc, total: totalTax(p.openingItc) },
        added: { ...u.gstr3b.s4.a.total, total: totalTax(u.gstr3b.s4.a.total) },
        reversed: { ...u.gstr3b.s4.b.total, total: totalTax(u.gstr3b.s4.b.total) },
        used: { ...p.itcUsed, total: totalTax(p.itcUsed) },
        closing: { ...p.closingItc, total: totalTax(p.closingItc) },
        ineligible: totalTax(u.gstr3b.s4.d.ineligible),
      };
    });
    const range = fyUnits[0] ? { from: fyUnits[0].start, to: fyUnits[fyUnits.length - 1].end } : null;
    const bills = books.expenses
      .filter((e) => (range ? e.date >= range.from && e.date <= range.to : true))
      .map((e) => ({ id: e.id, date: e.date.toISOString().slice(0, 10), vendor: e.vendor, gstin: e.vendorGstin, invoiceNo: e.vendorInvoiceNo, itcStatus: e.itcStatus, tax: totalTax(e), hsn: e.hsn }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 200);
    return NextResponse.json({ periods, bills });
  } catch (error) {
    console.error("ITC ledger error:", error);
    return gstError(500, "ITC_FAILED", "Failed to load the ITC ledger.");
  }
}
