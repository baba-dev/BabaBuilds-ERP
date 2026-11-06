import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.hoisted(() => vi.fn());
const loadBillingMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { workspaceModule: { findUnique: findUniqueMock } } }));
vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entitlements")>()),
  loadWorkspaceBillingSnapshot: loadBillingMock,
}));

import { getModuleAvailability, isModuleEnabled } from "@/lib/modules";

const FUTURE = new Date(Date.now() + 86_400_000);
const PAID = { planTier: "PRO", subscriptionStatus: "PRO", subscriptionEndsAt: FUTURE };

describe("getModuleAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadBillingMock.mockResolvedValue(PAID);
  });

  it("reports plan_required for paid-only modules without a paid entitlement", async () => {
    loadBillingMock.mockResolvedValue({ planTier: "PRO", subscriptionStatus: "ACTIVE", subscriptionEndsAt: null });
    findUniqueMock.mockResolvedValue({ isEnabled: true });
    expect(await getModuleAvailability("ws", "CASH_FLOW")).toBe("plan_required");
    expect(await isModuleEnabled("ws", "CASH_FLOW")).toBe(false);
  });

  it("fails closed when billing data is missing", async () => {
    loadBillingMock.mockResolvedValue(null);
    expect(await getModuleAvailability("ws", "PAYROLL")).toBe("plan_required");
  });

  it("reports enabled / disabled from the workspace record when entitled", async () => {
    findUniqueMock.mockResolvedValueOnce({ isEnabled: true });
    expect(await getModuleAvailability("ws", "PAYROLL")).toBe("enabled");
    findUniqueMock.mockResolvedValueOnce({ isEnabled: false });
    expect(await getModuleAvailability("ws", "PAYROLL")).toBe("disabled");
  });

  it("treats a missing record as disabled, except for default-enabled modules", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getModuleAvailability("ws", "PAYROLL")).toBe("disabled");
    // SHOP is the free-tier, default-enabled module
    loadBillingMock.mockResolvedValue({ planTier: "FREE", subscriptionStatus: "FREE", subscriptionEndsAt: null });
    expect(await getModuleAvailability("ws", "SHOP")).toBe("enabled");
  });

  it("isModuleEnabled agrees with getModuleAvailability", async () => {
    findUniqueMock.mockResolvedValue({ isEnabled: true });
    expect(await isModuleEnabled("ws", "PAYROLL")).toBe(true);
    findUniqueMock.mockResolvedValue({ isEnabled: false });
    expect(await isModuleEnabled("ws", "PAYROLL")).toBe(false);
  });
});
