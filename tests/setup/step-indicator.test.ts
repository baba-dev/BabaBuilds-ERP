import { describe, expect, it } from "vitest";

import { getSetupStepNameKey } from "@/components/setup/step-indicator";

describe("getSetupStepNameKey", () => {
  it("returns the expected label key for quick mode steps", () => {
    expect(getSetupStepNameKey(1)).toBe("step_geo");
    expect(getSetupStepNameKey(2)).toBe("step_finance");
    expect(getSetupStepNameKey(3)).toBe("step_compliance");
  });

  it("returns the expected label key for full mode steps", () => {
    expect(getSetupStepNameKey(4)).toBe("step_identity");
    expect(getSetupStepNameKey(5)).toBe("step_integrations");
    expect(getSetupStepNameKey(6)).toBe("step_shop");
    expect(getSetupStepNameKey(7)).toBe("step_modules");
  });
});
