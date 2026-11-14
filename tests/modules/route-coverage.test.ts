import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every API route that belongs to an optional module must refuse a workspace where the module is off. Guards are
 * written by hand per route, so this reads the sources and fails when a route is added without one.
 */
const ROOT = path.resolve(__dirname, "../..");
const DIRECT = /requireModule\(|isModuleEnabled\(|getModuleAvailability\(/;

const MODULES: Array<{ key: string; dirs: string[]; guard: RegExp; allow?: Record<string, string> }> = [
  { key: "WORKFORCE", dirs: ["app/api/workforce"], guard: DIRECT },
  { key: "PAYROLL", dirs: ["app/api/payroll"], guard: /requirePayrollModuleAndAction|requirePayrollSettingsAccess|isModuleEnabled\(|requireModule\(/ },
  { key: "DOCUMENTS", dirs: ["app/api/documents"], guard: /requireDocumentsModule|requireModule\(|isModuleEnabled\(|DOCUMENTS/ },
  { key: "CASH_FLOW", dirs: ["app/api/cash-flow"], guard: /requireCashFlowAccess/ },
  { key: "AR_COLLECTIONS", dirs: ["app/api/ar-collections"], guard: /requireArAccess/ },
  { key: "REPORTING_CENTER", dirs: ["app/api/reporting"], guard: /resolveReportingContext|requireModule\(/ },
  { key: "IMPORT_MANAGER", dirs: ["app/api/imports"], guard: /requireImportContext/ },
  { key: "SHOP", dirs: ["app/api/shop"], guard: /isModuleEnabled\(|requireModule\(|getModuleAvailability\(|requireShopModule/, allow: { "app/api/shop/check-slug/route.ts": "answers whether a slug is free, needed before the shop exists" } },
  { key: "MIAB_BILLING", dirs: ["app/api/email-billing"], guard: /requireEmailBilling/ },
  { key: "POS", dirs: ["app/api/pos"], guard: DIRECT },
  { key: "MULTI_COMPANY", dirs: ["app/api/companies"], guard: /requireCompanyGroupContext|isModuleEnabled\(|requireModule\(/ },
];

function routes(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

describe("optional module routes are guarded", () => {
  for (const m of MODULES) {
    it(`${m.key}: every route checks the module (or is explicitly allowed)`, () => {
      const files = m.dirs.flatMap((d) => routes(path.join(ROOT, d)));
      expect(files.length).toBeGreaterThan(0);
      const unguarded = files.map((f) => path.relative(ROOT, f)).filter((rel) => !m.allow?.[rel] && !m.guard.test(fs.readFileSync(path.join(ROOT, rel), "utf8")));
      expect(unguarded).toEqual([]);
    });
  }
});

describe("the shared guards really check the module", () => {
  const HELPERS: Array<[string, RegExp]> = [
    ["app/api/payroll/_context.ts", /isModuleEnabled\(workspaceId, 'PAYROLL'\)/],
    ["app/api/payroll/settings/_shared.ts", /isModuleEnabled\(workspaceId, 'PAYROLL'\)/],
    ["lib/cash-flow/access.ts", /requireModule\(workspaceId, "CASH_FLOW"\)/],
    ["lib/ar/access.ts", /requireModule\(workspaceId, .AR_COLLECTIONS.\)/],
    ["lib/imports/core/auth.ts", /requireModule\(membership\.workspaceId, 'IMPORT_MANAGER'\)/],
    ["app/api/reporting/_shared.ts", /requireModule\(wu\.workspaceId, 'REPORTING_CENTER'\)/],
    ["app/api/email-billing/_lib/auth.ts", /MIAB_BILLING/],
    ["app/api/companies/_shared.ts", /MULTI_COMPANY/],
  ];
  for (const [file, pattern] of HELPERS) {
    it(`${file} checks the module`, () => {
      expect(fs.readFileSync(path.join(ROOT, file), "utf8")).toMatch(pattern);
    });
  }
});

describe("module guards use the workspace the user switched to", () => {
  const FILES = ["lib/imports/core/auth.ts", "app/api/reporting/_shared.ts", "app/api/reporting/abilities/route.ts", "app/(dashboard)/reporting/layout.tsx", "app/(dashboard)/import-manager/layout.tsx"];
  for (const file of FILES) {
    it(`${file} resolves the session workspace, not the oldest membership`, () => {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(src).toContain("resolveSessionMembership");
      expect(src).not.toMatch(/orderBy:\s*\{\s*joinedAt/);
    });
  }
});

describe("no module route picks an arbitrary membership", () => {
  const ANY_MEMBERSHIP = /workspaceUser\.findFirst\(\{\s*where:\s*\{\s*userId[,:\s][^}]*isActive/;
  for (const m of MODULES) {
    it(`${m.key}: workspace comes from the session`, () => {
      const offenders = m.dirs.flatMap((d) => routes(path.join(ROOT, d))).map((f) => path.relative(ROOT, f)).filter((rel) => {
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        // A lookup that names the workspace (workspaceId: ...) is a membership check, not a workspace choice.
        return ANY_MEMBERSHIP.test(src) && !/workspaceUser\.findFirst\(\{\s*where:\s*\{[^}]*workspaceId/.test(src.match(ANY_MEMBERSHIP)?.[0] ?? "");
      });
      expect(offenders).toEqual([]);
    });
  }
});
