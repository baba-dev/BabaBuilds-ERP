import { NextResponse } from "next/server";
import { buildCompaniesOverview } from "@/lib/companies/overview";
import { errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "../_shared";

/** Company cards with last-30-day figures and setup health, limited to the companies this member can access. */
export async function GET() {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    const data = await buildCompaniesOverview(context.userId, context.companyGroupId, context.workspaceId);
    return NextResponse.json({ data, groupRole: context.groupRole });
  } catch (error) {
    console.error("[companies/overview/GET]", error);
    return errorJson("Internal server error", 500);
  }
}
