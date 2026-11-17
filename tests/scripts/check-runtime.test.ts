import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { evaluateRuntime, satisfies, GUARDED_PACKAGES } from "../../scripts/check-runtime.mjs";

const pkg = {
  dependencies: { "@prisma/client": "7.10.1", "@prisma/adapter-pg": "7.10.1", ioredis: "^6.0.0", next: "16.4.5" },
  devDependencies: { prisma: "7.10.1" },
};
const fresh = { prisma: "7.10.1", "@prisma/client": "7.10.1", "@prisma/adapter-pg": "7.10.1", ioredis: "6.1.2", next: "16.4.5" };

describe("runtime guard", () => {
  it("passes on the pinned toolchain", () => {
    const r = evaluateRuntime({ nodeVersion: "26.13.1", expectedNode: "26.13.1", pkg, installed: fresh });
    expect(r).toEqual({ errors: [], warnings: [] });
  });

  it("flags the stale install that produced Prisma 6 and missing pg/ioredis", () => {
    const r = evaluateRuntime({
      nodeVersion: "26.13.1", expectedNode: "26.13.1", pkg,
      installed: { prisma: "6.19.2", "@prisma/client": "6.19.2", next: "16.4.5" },
    });
    expect(r.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("@prisma/client 6.19.2"),
      expect.stringContaining("@prisma/adapter-pg is declared"),
      expect.stringContaining("ioredis is declared"),
    ]));
  });

  it("only warns on a Node major mismatch, so the Node 22 production release is never blocked", () => {
    const r = evaluateRuntime({ nodeVersion: "22.23.4", expectedNode: "26.13.1", pkg, installed: fresh });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain("nvm use");
    const strict = evaluateRuntime({ nodeVersion: "22.23.4", expectedNode: "26.13.1", pkg, installed: fresh, strict: true });
    expect(strict.errors).toHaveLength(1);
  });

  it("matches exact pins exactly and ranges by major", () => {
    expect(satisfies("7.10.1", "7.10.1")).toBe(true);
    expect(satisfies("7.10.2", "7.10.1")).toBe(false);
    expect(satisfies("6.9.0", "^6.0.0")).toBe(true);
    expect(satisfies("5.9.0", "^6.0.0")).toBe(false);
    expect(satisfies(undefined, "1.0.0")).toBe(false);
    expect(GUARDED_PACKAGES).toContain("ioredis");
  });
});
