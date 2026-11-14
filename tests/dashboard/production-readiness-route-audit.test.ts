import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routeHasPage(route: string) {
  const clean = route.replace(/^\//, "");
  const candidates = [
    path.join(process.cwd(), "app", clean, "page.tsx"),
    path.join(process.cwd(), "app", "(dashboard)", clean, "page.tsx"),
  ];

  return candidates.some((candidate) => fs.existsSync(candidate));
}

describe("production readiness route audit links", () => {
  it("points audited CTA links to valid app pages", () => {
    const routes = ["/settings/billing", "/referrals", "/admin", "/access-denied", "/documents"];

    for (const route of routes) {
      expect(routeHasPage(route)).toBe(true);
    }
  });

  it("has no broken internal route references anywhere in app/components/content (GATE-003)", () => {
    const result = spawnSync(process.execPath, ["scripts/route-integrity-report.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const report = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "docs", "reports", "route-integrity-report.json"), "utf8"),
    ) as { gate: { pass: boolean }; brokenRoutes: Array<{ route: string; references: string[] }> };

    expect(report.brokenRoutes).toEqual([]);
    expect(report.gate.pass).toBe(true);
    expect(result.status).toBe(0);
  }, 30_000);
});
