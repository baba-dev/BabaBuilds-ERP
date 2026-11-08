import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const withPermissionMock = vi.fn();
const prismaMock = {
  expense: { findFirst: vi.fn(), update: vi.fn() },
  gstAdjustment: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  gstReturn: { findUnique: vi.fn(), upsert: vi.fn() },
  businessProfile: { findUnique: vi.fn(), update: vi.fn() },
  gstReturnComment: { create: vi.fn(), findMany: vi.fn() },
};

vi.mock("next-auth/next", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rbac", () => ({ withPermission: withPermissionMock, checkPermissionsSilent: vi.fn(), checkPermissionSilent: vi.fn() }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/gst/data", () => ({ loadGstProfile: vi.fn(async () => ({ stateCode: "27", gstin: null })) }));

const session = { workspaceId: "ws1", user: { id: "u1", name: "Ann" } };
const json = (body: unknown, method = "POST") => new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const granted = () => withPermissionMock.mockResolvedValue({ granted: true, role: "OWNER" });

describe("GST route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    granted();
  });

  it("rejects anonymous callers before touching data", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/gst/adjustments/route");
    const res = await POST(json({}));
    expect(res.status).toBe(401);
    expect(prismaMock.gstAdjustment.create).not.toHaveBeenCalled();
  });

  it("returns the RBAC response when the permission is missing", async () => {
    const { NextResponse } = await import("next/server");
    withPermissionMock.mockResolvedValue({ granted: false, response: NextResponse.json({ code: "RBAC_PERMISSION_DENIED" }, { status: 403 }) });
    const { POST } = await import("@/app/api/gst/filings/route");
    const res = await POST(json({ returnType: "GSTR1", periodKey: "2026-04", filedAt: "2026-05-10" }));
    expect(res.status).toBe(403);
    expect(withPermissionMock).toHaveBeenCalledWith("u1", "ws1", "tax.file");
  });

  it("needs tax.approve to approve a review and tax.manage to request one", async () => {
    const { PUT } = await import("@/app/api/gst/filings/route");
    prismaMock.gstReturn.findUnique.mockResolvedValue({ status: "READY_FOR_REVIEW" });
    await PUT(json({ returnType: "GSTR3B", periodKey: "2026-04", action: "APPROVE" }, "PUT"));
    expect(withPermissionMock).toHaveBeenLastCalledWith("u1", "ws1", "tax.approve");
    await PUT(json({ returnType: "GSTR3B", periodKey: "2026-04", action: "REQUEST_REVIEW" }, "PUT"));
    expect(withPermissionMock).toHaveBeenLastCalledWith("u1", "ws1", "tax.manage");
  });

  it("will not approve a return nobody asked to review, or change a filed one", async () => {
    const { PUT } = await import("@/app/api/gst/filings/route");
    prismaMock.gstReturn.findUnique.mockResolvedValue({ status: "OPEN" });
    expect((await PUT(json({ returnType: "GSTR3B", periodKey: "2026-04", action: "APPROVE" }, "PUT"))).status).toBe(409);
    prismaMock.gstReturn.findUnique.mockResolvedValue({ status: "FILED" });
    expect((await PUT(json({ returnType: "GSTR3B", periodKey: "2026-04", action: "REQUEST_REVIEW" }, "PUT"))).status).toBe(409);
    expect(prismaMock.gstReturn.upsert).not.toHaveBeenCalled();
  });

  it("validates adjustments and records who added them", async () => {
    const { POST } = await import("@/app/api/gst/adjustments/route");
    expect((await POST(json({ periodKey: "2026-13", kind: "ITC_OPENING", igst: 5 }))).status).toBe(400);
    expect((await POST(json({ periodKey: "2026-04", kind: "ITC_OPENING" }))).status).toBe(400);
    expect((await POST(json({ periodKey: "2026-04", kind: "NOT_A_KIND", igst: 5 }))).status).toBe(400);
    prismaMock.gstAdjustment.create.mockResolvedValue({ id: "a1" });
    const ok = await POST(json({ periodKey: "2026-04", kind: "TDS_CREDIT", cgst: 100 }));
    expect(ok.status).toBe(201);
    expect(prismaMock.gstAdjustment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ workspaceId: "ws1", createdByUserId: "u1", kind: "TDS_CREDIT", cgst: 100 }) });
  });

  it("rejects a credit claim month before the bill and 2B tax above the bill amount", async () => {
    const { PATCH } = await import("@/app/api/gst/bills/[id]/route");
    prismaMock.expense.findFirst.mockResolvedValue({ id: "e1", date: new Date("2026-09-05T00:00:00Z"), amount: 1000, itcStatus: "ELIGIBLE" });
    const ctx = { params: Promise.resolve({ id: "e1" }) };
    expect((await PATCH(json({ itcClaimMonth: "2026-07" }, "PATCH"), ctx)).status).toBe(400);
    expect((await PATCH(json({ acceptTwoB: { igst: 2000, cgst: 0, sgst: 0, cess: 0 } }, "PATCH"), ctx)).status).toBe(400);
    expect((await PATCH(json({}, "PATCH"), ctx)).status).toBe(400);
    expect(prismaMock.expense.update).not.toHaveBeenCalled();
    prismaMock.expense.update.mockResolvedValue({});
    expect((await PATCH(json({ itcHeld: true, itcClaimMonth: "2026-10" }, "PATCH"), ctx)).status).toBe(200);
    expect(prismaMock.expense.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { itcHeld: true, itcClaimMonth: "2026-10" } });
  });

  it("scopes bill updates to the caller's workspace", async () => {
    const { PATCH } = await import("@/app/api/gst/bills/[id]/route");
    prismaMock.expense.findFirst.mockResolvedValue(null);
    const res = await PATCH(json({ itcHeld: true }, "PATCH"), { params: Promise.resolve({ id: "other" }) });
    expect(res.status).toBe(404);
    expect(prismaMock.expense.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other", workspaceId: "ws1" } }));
  });

  it("refuses an invalid GSTIN when saving settings and an unknown comment target", async () => {
    const settings = await import("@/app/api/gst/settings/route");
    prismaMock.businessProfile.findUnique.mockResolvedValue({ id: "p1" });
    const bad = await settings.PATCH(json({ gstin: "27AABCU9603R1ZZ" }, "PATCH"));
    expect(bad.status).toBe(400);
    expect(prismaMock.businessProfile.update).not.toHaveBeenCalled();
    const comments = await import("@/app/api/gst/comments/route");
    expect((await comments.POST(json({ returnType: "GSTR3B", periodKey: "bogus", body: "hi" }))).status).toBe(400);
  });
});
