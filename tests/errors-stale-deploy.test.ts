import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "@/lib/errors/stale-deploy";

describe("isStaleDeployError", () => {
  it("detects stale-chunk failures", () => {
    expect(isStaleDeployError({ name: "ChunkLoadError", message: "Loading chunk 123 failed." })).toBe(true);
    expect(isStaleDeployError({ message: "Failed to fetch dynamically imported module: https://x/_next/static/a.js" })).toBe(true);
    expect(isStaleDeployError({ message: "Importing a module script failed." })).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isStaleDeployError({ name: "TypeError", message: "x is not a function" })).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });
});
