import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueUser: vi.fn(),
  findManyCompanyGroupMembers: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUniqueUser },
    companyGroupMember: { findMany: mocks.findManyCompanyGroupMembers },
  },
}));

vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })),
}));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/auth-observability", () => ({
  recordAuthFailure: vi.fn(),
  recordPasswordAuthAuditEvent: vi.fn(),
}));
vi.mock("@/lib/auth-workspace-provision", () => ({
  provisionTrialWorkspace: vi.fn(),
  sanitizeSignupIntent: vi.fn((intent) => intent),
}));
vi.mock("@/lib/signup-intent", () => ({
  deserializeSignupIntent: vi.fn(() => null),
  SIGNUP_INTENT_COOKIE: "signup_intent",
}));
vi.mock("@/lib/auth/passkeys", () => ({ consumeLoginToken: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({
  normalizeLoginEmail: vi.fn((email) => email),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkPasswordAuthRateLimit: vi.fn(),
  clearPasswordAuthRateLimit: vi.fn(),
  hashRateLimitValue: vi.fn((value) => value),
  recordPasswordAuthFailure: vi.fn(),
}));
vi.mock("@/lib/auth/provider-flags", () => ({ isGoogleAuthEnabled: vi.fn(() => false) }));
vi.mock("@/lib/security/access-risk", () => ({
  HIGH_RISK_MAGIC_LINK_ERROR_CODE: "HIGH_RISK_MAGIC_LINK_BLOCKED",
  HIGH_RISK_PASSWORD_ERROR_CODE: "HIGH_RISK_PASSWORD_ONLY_BLOCKED",
  MFA_POLICY_ERROR_CODE: "MFA_POLICY_BLOCK",
  classifyLoginProvider: vi.fn(() => ({ method: "oauth", provider: "google" })),
  hasHighRiskRole: vi.fn(() => false),
  isEmailMagicLinkAllowedForRoles: vi.fn(() => true),
  isMagicLinkExceptionEmail: vi.fn(() => false),
  isPhishingResistantSignIn: vi.fn(() => true),
}));

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const workspace = (id: string, name: string) => ({
  id,
  name,
  baseCurrency: id === "company_b" ? "EUR" : "USD",
  isSetupComplete: true,
  countryCode: id === "company_b" ? "DE" : "US",
  companyGroupLinks: [
    {
      companyGroupId: "group_1",
      companyGroup: { name: "Global Group" },
    },
  ],
});

describe("authOptions.callbacks.jwt workspace updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUniqueUser.mockResolvedValue({
      email: "owner@example.com",
      name: "Owner",
      locale: "en",
      currencyFormat: "symbol",
      workspaces: [
        {
          role: "OWNER",
          businessRole: "OWNER",
          workspace: workspace("company_a", "Company A"),
        },
      ],
    });
    mocks.findManyCompanyGroupMembers.mockResolvedValue([
      {
        role: "ADMIN",
        groupRole: "ADMIN",
        accessMode: "ALL_COMPANIES",
        companyGroup: {
          workspaces: [
            { isActive: true, workspace: workspace("company_b", "Company B") },
          ],
        },
        workspaceAccess: [],
      },
    ]);
  });

  it("updates the token to a company that is accessible through company-group access", async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: { id: "user_1", workspaceId: "company_a", locale: "en" },
      trigger: "update",
      session: { workspaceId: "company_b" },
    } as never);

    expect(token.workspaceId).toBe("company_b");
    expect(token.activeCompanyName).toBe("Company B");
    expect(token.baseCurrency).toBe("EUR");
    expect(token.role).toBe("ADMIN");
    expect(mocks.findManyCompanyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1", isActive: true } }),
    );
  });

  it("returns the updated workspaceId on a subsequent getServerSession(authOptions) call", async () => {
    mocks.getServerSession.mockImplementationOnce(async (options) => {
      const token = await options.callbacks.jwt({
        token: { id: "user_1", workspaceId: "company_a", locale: "en" },
        trigger: "update",
        session: { workspaceId: "company_b" },
      });

      return options.callbacks.session({
        session: { user: { id: "", email: "owner@example.com" } },
        token,
      });
    });

    const session = await getServerSession(authOptions);

    expect(session?.workspaceId).toBe("company_b");
    expect(session?.activeCompanyName).toBe("Company B");
    expect(mocks.getServerSession).toHaveBeenCalledWith(authOptions);
  });
});
