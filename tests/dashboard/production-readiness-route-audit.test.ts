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
    const routes = ["/settings/billing", "/referrals", "/admin"];

    for (const route of routes) {
      expect(routeHasPage(route)).toBe(true);
    }
  });
});
