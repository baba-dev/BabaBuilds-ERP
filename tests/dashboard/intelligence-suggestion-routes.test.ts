import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INTELLIGENCE_SUGGESTION_ROUTES } from "@/app/(dashboard)/dashboard/intelligence-suggestion-routes";

function routeHasPage(route: string) {
  const clean = route.replace(/^\//, "");
  const candidates = [
    path.join(process.cwd(), "app", clean, "page.tsx"),
    path.join(process.cwd(), "app", "(dashboard)", clean, "page.tsx"),
  ];

  return candidates.some((candidate) => fs.existsSync(candidate));
}

describe("INTELLIGENCE_SUGGESTION_ROUTES", () => {
  it("maps each suggestion route to a real page", () => {
    for (const route of Object.values(INTELLIGENCE_SUGGESTION_ROUTES)) {
      expect(route.startsWith("/")).toBe(true);
      expect(routeHasPage(route)).toBe(true);
    }
  });
});
