import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyInvites: vi.fn(),
  findManyMemberships: vi.fn(),
  recordAuthFailure: vi.fn(),
  hasHighRiskRole: vi.fn(),
  isPhishingResistantSignIn: vi.fn(),
  isMagicLinkExceptionEmail: vi.fn(),
  isEmailMagicLinkAllowedForRoles: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceInvite: { findMany: mocks.findManyInvites },
    workspaceUser: { findMany: mocks.findManyMemberships },
  },
}));

vi.mock("@/lib/auth-observability", () => ({ recordAuthFailure: mocks.recordAuthFailure }));
vi.mock("@/lib/security/access-risk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/access-risk")>()),
  HIGH_RISK_MAGIC_LINK_ERROR_CODE: "HIGH_RISK_MAGIC_LINK_BLOCKED",
  hasHighRiskRole: mocks.hasHighRiskRole,
  isEmailMagicLinkAllowedForRoles: mocks.isEmailMagicLinkAllowedForRoles,
  isMagicLinkExceptionEmail: mocks.isMagicLinkExceptionEmail,
  isPhishingResistantSignIn: mocks.isPhishingResistantSignIn,
}));

vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));

import { authOptions } from "@/lib/auth";

describe("authOptions.callbacks.signIn MFA policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findManyInvites.mockResolvedValue([]);
    mocks.findManyMemberships.mockResolvedValue([{ role: "OWNER", workspaceId: "ws_1" }]);
    mocks.hasHighRiskRole.mockReturnValue(true);
    mocks.isPhishingResistantSignIn.mockReturnValue(false);
    mocks.isMagicLinkExceptionEmail.mockReturnValue(false);
    mocks.isEmailMagicLinkAllowedForRoles.mockReturnValue(true);
  });

  it("blocks high-risk real users without phishing-resistant auth", async () => {
    const result = await authOptions.callbacks!.signIn!({
      user: { id: "u1", email: "owner@example.com" },
      account: { provider: "google", type: "oauth" },
    } as never);

    expect(result).toBe("/login?error=MFA_POLICY_BLOCK&provider=google");
    expect(mocks.recordAuthFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MFA_POLICY_BLOCK", provider: "google" }),
    );
  });

  it("allows demo credentials sign-in for demo accounts when MFA would otherwise block", async () => {
    const result = await authOptions.callbacks!.signIn!({
      user: { id: "u_demo", email: "temp@bababuilds.demo" },
      account: { provider: "credentials", type: "credentials" },
    } as never);

    expect(result).toBe(true);
    expect(mocks.recordAuthFailure).not.toHaveBeenCalled();
  });
});
