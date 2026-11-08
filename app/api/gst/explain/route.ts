import { NextResponse } from "next/server";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { computeFyUnits } from "@/lib/gst/service";
import { loadGstProfile } from "@/lib/gst/data";
import { fyStartYear, parseFyLabel, periodRange } from "@/lib/gst/calendar";
import { EXPLAIN_KEYS, explainSources, type ExplainKey } from "@/lib/gst/explain";

/** "Why is this number what it is": the invoices, bills, notes and adjustments behind one line of a return. */
export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams;
  const key = q.get("key") as ExplainKey | null;
  if (!key || !(EXPLAIN_KEYS as readonly string[]).includes(key)) return gstError(400, "INVALID_KEY", "Unknown return line.");
  const profile = await loadGstProfile(auth.access.workspaceId);
  const period = q.get("period");
  const fyParam = q.get("fy");
  let fy: number | null;
  let ranges: Array<{ start: Date; end: Date }>;
  if (period) {
    const r = periodRange(period);
    if (!r) return gstError(400, "INVALID_PERIOD", "Unknown return period.");
    fy = fyStartYear(r.start);
    ranges = [r];
  } else {
    fy = fyParam ? parseFyLabel(fyParam) : fyStartYear(new Date());
    if (fy === null) return gstError(400, "INVALID_FY", "Use a financial year like 2026-27.");
    ranges = [{ start: new Date(Date.UTC(fy, 3, 1)), end: new Date(Date.UTC(fy + 1, 2, 31, 23, 59, 59, 999)) }];
  }
  const { books } = await computeFyUnits(profile, fy);
  const items = explainSources(key, ranges, books);
  return NextResponse.json({ key, items: items.slice(0, 300), total: items.length });
}
