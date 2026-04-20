import { describe, expect, it } from "vitest";
import { isDemoEmail, parseCompletedSteps, serializeCompletedSteps } from "@/lib/onboarding";

describe("onboarding utilities", () => {
  it("detects demo-account email suffix safely", () => {
    expect(isDemoEmail("demo_123@bababuilds.demo")).toBe(true);
    expect(isDemoEmail("DEMO_123@Bababuilds.demo")).toBe(true);
    expect(isDemoEmail("owner@company.com")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });

  it("parses and filters allowed onboarding step ids", () => {
    const parsed = parseCompletedSteps(
      JSON.stringify(["dashboard_overview", "invalid_step", "create_service"]),
    );
    expect(parsed).toEqual(["dashboard_overview", "create_service"]);
  });

  it("serializes unique step ids without duplicates", () => {
    const serialized = serializeCompletedSteps([
      "add_first_client",
      "add_first_client",
      "complete_profile",
    ]);
    expect(serialized).toBe('["add_first_client","complete_profile"]');
  });
});
