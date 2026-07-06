import { beforeEach, describe, expect, it, vi } from "vitest";

const companyGroupWorkspaceFindFirst = vi.fn();
const businessProfileFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyGroupWorkspace: {
      findFirst: (...args: unknown[]) => companyGroupWorkspaceFindFirst(...args),
    },
    businessProfile: {
      findUnique: (...args: unknown[]) => businessProfileFindUnique(...args),
    },
  },
}));

describe("resolveBusinessProfileSettings", () => {
  beforeEach(() => {
    companyGroupWorkspaceFindFirst.mockReset();
    businessProfileFindUnique.mockReset();
  });

  it("uses the current company profile by default", async () => {
    const { resolveBusinessProfileSettings } = await import("@/lib/business-profile-inheritance");
    const profile = { workspaceId: "ws_child", inheritSmtpFromGroup: false, smtpHost: "smtp.child.test" };

    await expect(resolveBusinessProfileSettings(profile, "smtp")).resolves.toBe(profile);
    expect(companyGroupWorkspaceFindFirst).not.toHaveBeenCalled();
    expect(businessProfileFindUnique).not.toHaveBeenCalled();
  });

  it("loads the group billing workspace profile when inheritance is enabled", async () => {
    const { resolveBusinessProfileSettings } = await import("@/lib/business-profile-inheritance");
    const childProfile = { workspaceId: "ws_child", inheritPaymentGatewayFromGroup: true, razorpayKeyId: "rzp_child" };
    const billingProfile = { workspaceId: "ws_billing", inheritPaymentGatewayFromGroup: false, razorpayKeyId: "rzp_billing" };
    companyGroupWorkspaceFindFirst.mockResolvedValue({ companyGroup: { billingWorkspaceId: "ws_billing" } });
    businessProfileFindUnique.mockResolvedValue(billingProfile);

    await expect(resolveBusinessProfileSettings(childProfile, "paymentGateway")).resolves.toBe(billingProfile);
    expect(companyGroupWorkspaceFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws_child", isActive: true },
      select: { companyGroup: { select: { billingWorkspaceId: true } } },
    });
    expect(businessProfileFindUnique).toHaveBeenCalledWith({ where: { workspaceId: "ws_billing" } });
  });

  it("falls back to the current profile when the group has no billing profile", async () => {
    const { resolveBusinessProfileSettings } = await import("@/lib/business-profile-inheritance");
    const profile = { workspaceId: "ws_child", inheritSmtpFromGroup: true, smtpHost: "smtp.child.test" };
    companyGroupWorkspaceFindFirst.mockResolvedValue({ companyGroup: { billingWorkspaceId: "ws_billing" } });
    businessProfileFindUnique.mockResolvedValue(null);

    await expect(resolveBusinessProfileSettings(profile, "smtp")).resolves.toBe(profile);
  });

  it("falls back to the current profile when there is no active group", async () => {
    const { resolveBusinessProfileSettings } = await import("@/lib/business-profile-inheritance");
    const profile = { workspaceId: "ws_child", inheritPaymentGatewayFromGroup: true, stripePublishableKey: "pk_child" };
    companyGroupWorkspaceFindFirst.mockResolvedValue(null);

    await expect(resolveBusinessProfileSettings(profile, "paymentGateway")).resolves.toBe(profile);
    expect(businessProfileFindUnique).not.toHaveBeenCalled();
  });
});
