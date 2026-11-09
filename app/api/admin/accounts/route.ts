import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { ACCESS_FILTERS, listAccounts, type AccessFilter } from "@/lib/admin/accounts";

/** Workspaces with search, filters and paging. The list is by workspace (the unit that holds a plan), not by user. */
export async function GET(request: Request) {
  try {
    await verifySuperAdmin();
    const sp = new URL(request.url).searchParams;
    const access = sp.get("access");
    const demo = sp.get("demo");
    const sort = sp.get("sort");
    const result = await listAccounts({
      q: sp.get("q") ?? undefined,
      access: ACCESS_FILTERS.includes(access as AccessFilter) ? (access as AccessFilter) : undefined,
      demo: demo === "only" || demo === "all" ? demo : "hide",
      sort: sort === "oldest" || sort === "name" || sort === "ending" ? sort : "newest",
      page: Number(sp.get("page") ?? 1) || 1,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminApiError(error, "Failed to list accounts");
  }
}
