import { NextResponse } from "next/server";
import { caError, requireCaAccess } from "@/lib/ca/access";
import { getCaOverview } from "@/lib/ca/data";
import { fyStartYear, parseAnyFy } from "@/lib/ca/fy";
import { checkPermissionsSilent } from "@/lib/rbac";

/** One financial year of CA compliance: calendar, readiness, figures, requests, and what the caller may do. */
export async function GET(request: Request) {
  const auth = await requireCaAccess("ca.view");
  if (!auth.ok) return auth.response;
  const fyParam = new URL(request.url).searchParams.get("fy");
  const start = fyParam ? parseAnyFy(fyParam) : fyStartYear(new Date());
  if (start === null) return caError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  try {
    const [overview, grants] = await Promise.all([
      getCaOverview(auth.access.workspaceId, start),
      checkPermissionsSilent(auth.access.userId, auth.access.workspaceId, ["ca.manage", "ca.request", "ca.signoff", "ca.export", "workspace.manage_members", "tax.view"] as const),
    ]);
    return NextResponse.json({
      ...overview,
      me: { userId: auth.access.userId },
      access: { manage: !!grants["ca.manage"], request: !!grants["ca.request"], signoff: !!grants["ca.signoff"], export: !!grants["ca.export"], invite: !!grants["workspace.manage_members"], gst: !!grants["tax.view"] },
    });
  } catch (error) {
    console.error("CA overview error:", error);
    return caError(500, "CA_OVERVIEW_FAILED", "Failed to compile the compliance overview.");
  }
}
