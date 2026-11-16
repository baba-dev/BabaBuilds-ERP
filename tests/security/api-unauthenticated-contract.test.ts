// @vitest-environment node
/**
 * Authorization contract: session-protected API groups that previously had no
 * test coverage must reject an anonymous caller (4xx) WITHOUT touching
 * the database. Any new route.ts added under these groups is picked up
 * automatically, so a route that forgets its auth guard fails this suite.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const touched: string[] = [];

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_t, model: string) {
        if (model === "then") return undefined;
        touched.push(String(model));
        throw new Error(`prisma.${String(model)} accessed by an unauthenticated request`);
      },
    },
  ),
}));

/** API groups that require a signed-in workspace member. Public/webhook routes are deliberately excluded. */
const PROTECTED_GROUPS = [
  "team",
  "inventory",
  "referrals",
  "notifications",
  "tax-codes",
  "bank-accounts",
  "investments",
  "msme",
  "finance",
  "partner",
  "workforce",
  "gst",
  "expenses",
  "settings",
  "cash-flow",
  "clients",
  "companies",
  "services",
  "reporting",
  "invoices",
] as const;

/** Intentionally public handlers, as "METHOD path". Keep this list minimal and justified. */
const PUBLIC_HANDLERS = new Set([
  // Returns only the VAPID *public* key, which browsers need before a user can subscribe.
  "GET app/api/notifications/push/subscribe/route.ts",
  // Returns all-false ability flags (no data) for anonymous callers so the UI can hide itself.
  "GET app/api/reporting/abilities/route.ts",
  // Authenticated by an unguessable per-workspace inbound token rather than a session.
  "POST app/api/expenses/inbound/[token]/route.ts",
]);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const apiRoot = path.join(process.cwd(), "app", "api");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(full);
    return e.name === "route.ts" ? [full] : [];
  });
}

const routes = PROTECTED_GROUPS.flatMap((g) => routeFiles(path.join(apiRoot, g))).map((f) => ({
  file: f,
  rel: path.relative(process.cwd(), f).split(path.sep).join("/"),
}));

beforeEach(() => {
  touched.length = 0;
});

describe("anonymous access to protected API groups", () => {
  it("discovers the route files under test", () => {
    expect(routes.length).toBeGreaterThanOrEqual(20);
  });

  for (const { file, rel } of routes) {
    it(`${rel} rejects anonymous callers before touching data`, async () => {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length).toBeGreaterThan(0);

      for (const method of handlers) {
        if (PUBLIC_HANDLERS.has(`${method} ${rel}`)) continue;
        const init: RequestInit = { method };
        if (method !== "GET" && method !== "DELETE") {
          init.headers = { "content-type": "application/json" };
          init.body = "{}";
        }
        const req = new Request("http://localhost/api/test?id=x", init);
        const res = await (mod[method] as (r: Request, ctx: unknown) => Promise<Response>)(req, {
          params: Promise.resolve({ id: "x", asset: "x" }),
        });
        // 401/403 from the guard, or 400 when the body is validated before the guard; never a success.
        expect(res.status, `${method} ${rel}`).toBeGreaterThanOrEqual(400);
        expect(res.status, `${method} ${rel}`).toBeLessThan(500);
        expect(touched, `${method} ${rel} touched the database`).toEqual([]);
      }
    });
  }
});
