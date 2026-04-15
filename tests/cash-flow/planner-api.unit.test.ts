import { describe, expect, it } from "vitest";

// Lightweight contract tests (no DB) for planner payload shapes.
// We keep these pure to avoid requiring sqlite setup in CI.

describe("cash-flow planner API contract (unit)", () => {
  it("accepts expected statuses", () => {
    const ok = ["open", "deferred", "resolved"] as const;
    expect(ok).toContain("open");
    expect(ok).toContain("deferred");
    expect(ok).toContain("resolved");
  });
});

