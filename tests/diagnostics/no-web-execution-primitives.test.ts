import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webDiagnosticsFiles = [
  "app/api/diagnostics/log/route.ts",
  "app/api/diagnostics/analyze/route.ts",
  "app/api/diagnostics/remediate/route.ts",
  "app/api/diagnostics/user-message/route.ts",
  "app/api/admin/diagnostics/analyze/route.ts",
  "app/api/admin/diagnostics/approve/route.ts",
  "lib/diagnostics/logger.ts",
  "lib/diagnostics/ai-analyzer.ts",
  "lib/diagnostics/remediation-policy.ts",
];

describe("web diagnostics execution boundary", () => {
  it.each(webDiagnosticsFiles)("keeps execution primitives out of %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).not.toMatch(/(?:node:)?child_process/);
    expect(source).not.toMatch(/\b(?:eval|AsyncFunction|Function)\s*\(/);
    expect(source).not.toMatch(/\bgit\s+apply\b/);
    expect(source).not.toMatch(/\bexec(?:File|Sync)?\s*\(/);
    expect(source).not.toMatch(/\bspawn(?:Sync)?\s*\(/);
  });

  it("keeps all legacy public diagnostic handlers inert", () => {
    for (const path of webDiagnosticsFiles.filter((path) => path.startsWith("app/api/diagnostics/"))) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain("status: 404");
      expect(source).not.toContain("req.json");
      expect(source).not.toContain("prisma.");
    }
  });
});
