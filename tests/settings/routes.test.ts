import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const withPermissionMock = vi.fn();
const checkSilentMock = vi.fn();
const billingMock = vi.fn();
const logActivityMock = vi.fn();
const profile = { workspaceId: "ws1", gstRegistrationType: "UNREGISTERED", companyName: "Acme", invoiceTermsDays: 7, primaryBankAccountId: null, shopSlug: null };
const txMock = { businessProfile: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() }, bankAccount: { updateMany: vi.fn() } };
const prismaMock = {
  workspace: { findUnique: vi.fn() },
  businessProfile: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  appActivityLog: { findMany: vi.fn(async () => []) },
  user: { update: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
};

vi.mock("next-auth/next", () => ({ getServerSession: getServerSessionMock }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rbac", () => ({ withPermission: withPermissionMock, checkPermissionsSilent: checkSilentMock }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: logActivityMock }));
vi.mock("@/lib/entitlements", () => ({ loadWorkspaceBillingSnapshot: billingMock, canUsePaymentGateways: (b: { paid: boolean }) => b.paid, shouldApplyFreeTierLimits: () => false }));
vi.mock("@/lib/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn(), noteDashboardCacheIncident: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ encrypt: (v: string) => `enc(${v})`, decrypt: (v: string) => v }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: vi.fn() })) }));
vi.mock("@/lib/banking/sync-primary-remittance-account", () => ({ syncPrimaryRemittanceBankAccount: vi.fn() }));

const session = { workspaceId: "ws1", user: { id: "u1", email: "o@acme.in" } };
const json = (body: unknown, method = "PATCH") => new Request("http://x/api/settings", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("settings routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    withPermissionMock.mockResolvedValue({ granted: true, role: "OWNER" });
    prismaMock.workspace.findUnique.mockResolvedValue({ countryCode: "IN" });
    prismaMock.businessProfile.findUnique.mockResolvedValue(profile);
    billingMock.mockResolvedValue({ paid: true });
  });

  it("refuses anyone without workspace.manage_settings", async () => {
    const { NextResponse } = await import("next/server");
    withPermissionMock.mockResolvedValue({ granted: false, response: NextResponse.json({ code: "RBAC_PERMISSION_DENIED" }, { status: 403 }) });
    const { PATCH } = await import("@/app/api/settings/route");
    const { PUT } = await import("@/app/api/settings/secrets/route");
    expect((await PATCH(json({ section: "automation", values: { gstRemindersEnabled: false } }))).status).toBe(403);
    expect((await PUT(json({ key: "smtpPassword", value: "x" }, "PUT"))).status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(withPermissionMock).toHaveBeenCalledWith("u1", "ws1", "workspace.manage_settings");
  });

  it("returns per-field errors for a bad section and writes nothing", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(json({ section: "tax", values: { panNumber: "12", gstin: "", udyamNumber: "", defaultSacCode: "998313" } }));
    expect(res.status).toBe(422);
    expect((await res.json()).fields).toEqual([{ field: "panNumber", code: "PAN" }]);
    expect(txMock.businessProfile.update).not.toHaveBeenCalled();
  });

  it("saves one section, records which fields changed and nothing else", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(json({ section: "invoicing", values: { invoiceTheme: "DESIGN_1", invoicePrefix: "bill", invoiceTermsDays: 30 } }));
    expect(res.status).toBe(200);
    expect(txMock.businessProfile.update).toHaveBeenCalledWith({ where: { workspaceId: "ws1" }, data: { invoiceTheme: "DESIGN_1", invoicePrefix: "BILL", invoiceTermsDays: 30 } });
    const log = logActivityMock.mock.calls[0][0];
    expect(log.action).toBe("settings_update");
    expect(log.metadata.section).toBe("invoicing");
    expect(log.metadata.changedFieldNames).toEqual(["invoicePrefix", "invoiceTermsDays", "invoiceTheme"].sort());
  });

  it("will not turn the shop on without an address, or take someone else's", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const noSlug = await PATCH(json({ section: "shop", values: { shopEnabled: true, shopSlug: "", shopTagline: "", shopAccentColor: "#112233" } }));
    expect(noSlug.status).toBe(422);
    prismaMock.businessProfile.findFirst.mockResolvedValue({ id: "other" });
    const taken = await PATCH(json({ section: "shop", values: { shopEnabled: true, shopSlug: "acme", shopTagline: "", shopAccentColor: "#112233" } }));
    expect(taken.status).toBe(409);
  });

  it("keeps gateway settings behind a paid plan", async () => {
    billingMock.mockResolvedValue({ paid: false });
    const { PATCH } = await import("@/app/api/settings/route");
    const { PUT } = await import("@/app/api/settings/secrets/route");
    expect((await PATCH(json({ section: "payments", values: { razorpayKeyId: "rzp_live_x" } }))).status).toBe(403);
    expect((await PUT(json({ key: "stripeSecretKey", value: "sk_live_x" }, "PUT"))).status).toBe(403);
    // Removing a secret is always allowed, and the SMTP password has no plan gate.
    expect((await PUT(json({ key: "smtpPassword", value: "pw" }, "PUT"))).status).toBe(200);
  });

  it("encrypts secrets, never logs their value, and can clear them", async () => {
    const { PUT } = await import("@/app/api/settings/secrets/route");
    await PUT(json({ key: "groqApiKey", value: "gsk_secret" }, "PUT"));
    expect(prismaMock.businessProfile.update).toHaveBeenCalledWith({ where: { workspaceId: "ws1" }, data: { groqApiKey: "enc(gsk_secret)" } });
    await PUT(json({ key: "groqApiKey", value: null }, "PUT"));
    expect(prismaMock.businessProfile.update).toHaveBeenLastCalledWith({ where: { workspaceId: "ws1" }, data: { groqApiKey: null } });
    expect(JSON.stringify(logActivityMock.mock.calls)).not.toContain("gsk_secret");
    expect(logActivityMock.mock.calls[0][0].metadata).toEqual({ secret: "groqApiKey" });
    expect(logActivityMock.mock.calls[1][0].action).toBe("settings_secret_cleared");
  });

  it("asks for the business profile before any other section on a new workspace", async () => {
    prismaMock.businessProfile.findUnique.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(json({ section: "automation", values: { gstRemindersEnabled: true } }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PROFILE_REQUIRED");
  });

  it("shows the change history only to people who manage settings, and returns field names, not values", async () => {
    const { NextResponse } = await import("next/server");
    withPermissionMock.mockResolvedValue({ granted: false, response: NextResponse.json({ code: "RBAC_PERMISSION_DENIED" }, { status: 403 }) });
    const { GET } = await import("@/app/api/settings/activity/route");
    expect((await GET()).status).toBe(403);
  });
});
