import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { getCaOverview } from "@/lib/ca/data";
import { calendarRegister, purchaseRegister, salesRegister, summaryRegister, tdsRegister } from "@/lib/ca/exports";
import { fyLabel, parseAnyFy } from "@/lib/ca/fy";
import { download, toCsv } from "@/lib/gst/access";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

const TYPES = ["sales", "purchases", "tds", "calendar", "summary"] as const;
type RegisterType = (typeof TYPES)[number];

/** One register as CSV. Needs ca.export, is rate limited, and every download is written to the audit trail. */
export async function GET(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/ca/export/registers", scope: "ca-export-register", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireCaAccess("ca.export");
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  const start = parseAnyFy(sp.get("fy"));
  const type = sp.get("type") as RegisterType | null;
  if (start === null) return caError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  if (!type || !TYPES.includes(type)) return caError(400, "INVALID_TYPE", `Choose one of ${TYPES.join(", ")}.`);
  const { workspaceId } = auth.access;
  try {
    let rows;
    if (type === "sales") rows = await salesRegister(workspaceId, start);
    else if (type === "purchases") rows = await purchaseRegister(workspaceId, start);
    else if (type === "tds") rows = await tdsRegister(workspaceId, start);
    else {
      const overview = await getCaOverview(workspaceId, start);
      rows = type === "calendar" ? calendarRegister(overview) : summaryRegister(overview);
    }
    await auditCa(auth.access, "EXPORT_REGISTER", { type: "Workspace", id: workspaceId }, { register: type, fy: fyLabel(start), rows: rows.length - 1 }, request);
    return download(toCsv(rows), `CA_${type}_FY${fyLabel(start)}.csv`, "text/csv");
  } catch (error) {
    console.error("CA register export error:", error);
    return caError(500, "EXPORT_FAILED", "Failed to build the register.");
  }
}
