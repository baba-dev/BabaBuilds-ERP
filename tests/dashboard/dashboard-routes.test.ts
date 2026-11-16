import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DASHBOARD_ROUTES, invoiceRoute } from "@/app/(dashboard)/dashboard/dashboard-routes";

function routeHasPage(route: string) {
  const clean = route.split("?")[0].replace(/^\//, "");
  return [
    path.join(process.cwd(), "app", clean, "page.tsx"),
    path.join(process.cwd(), "app", "(dashboard)", clean, "page.tsx"),
  ].some((candidate) => fs.existsSync(candidate));
}

const dashboardDir = path.join(process.cwd(), "app", "(dashboard)", "dashboard");

describe("dashboard links", () => {
  it("maps every dashboard destination to a real page", () => {
    for (const [key, route] of Object.entries(DASHBOARD_ROUTES)) {
      expect(route.startsWith("/"), key).toBe(true);
      expect(routeHasPage(route), `${key} -> ${route}`).toBe(true);
    }
    expect(routeHasPage(invoiceRoute("abc"))).toBe(true);
  });

  it("keeps route literals out of the dashboard components", () => {
    // A hard-coded href bypasses the check above, which is how the old dashboard ended up linking members to /admin.
    const offenders = fs
      .readdirSync(dashboardDir)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => /href=\{?["'`]\/[a-z]/.test(fs.readFileSync(path.join(dashboardDir, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("uses filter values the target pages understand", () => {
    expect(DASHBOARD_ROUTES.overdueInvoices).toBe("/income?status=OVERDUE");
    expect(DASHBOARD_ROUTES.acceptedProposals).toBe("/proposals?status=ACCEPTED");
  });
});
