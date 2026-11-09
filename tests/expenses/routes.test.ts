// @vitest-environment node
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireExpenseAccess: vi.fn(),
  deleteExpenses: vi.fn(),
  markPaid: vi.fn(),
  createExpense: vi.fn(),
  findDuplicates: vi.fn(),
  prisma: { expense: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/expenses/access", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/expenses/access")>()), requireExpenseAccess: mocks.requireExpenseAccess }));
vi.mock("@/lib/expenses/service", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/expenses/service")>()), deleteExpenses: mocks.deleteExpenses, markPaid: mocks.markPaid }));
vi.mock("@/lib/expenses/queries", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/expenses/queries")>()), findDuplicateExpenses: mocks.findDuplicates }));
vi.mock("@/lib/expenses/create-expense-with-side-effects", () => ({ createExpenseWithSideEffects: mocks.createExpense }));
vi.mock("@/lib/expenses/settings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/expenses/settings")>()), approvalForNewExpense: vi.fn(async () => "APPROVED"), workspaceSettingsStub: undefined }));
vi.mock("@/lib/expenses/budget-status", () => ({ budgetAlertsFor: vi.fn(async () => []) }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/expenses/inbox", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/expenses/inbox")>()), workspaceForInboxToken: vi.fn(async () => null) }));
vi.mock("@/lib/gst/data", () => ({ loadGstProfile: vi.fn(async () => ({ stateCode: "27" })) }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/rbac", () => ({ withPermission: vi.fn(async () => ({ granted: true })) }));

const ok = { ok: true, ctx: { workspaceId: "ws_1", userId: "u_1", email: "o@x.y", countryCode: "IN" } };
const denied = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
const json = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const form = (fields: Record<string, string>) => { const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, v)); return new Request("http://x/api/expenses", { method: "POST", body: fd }); };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireExpenseAccess.mockResolvedValue(ok);
  mocks.findDuplicates.mockResolvedValue([]);
});

describe("expense routes", () => {
  it("check permission before reading or changing anything", async () => {
    mocks.requireExpenseAccess.mockResolvedValue(denied);
    const list = await import("@/app/api/expenses/route");
    const bulk = await import("@/app/api/expenses/bulk/route");
    const summary = await import("@/app/api/expenses/summary/route");
    expect((await list.GET(new Request("http://x/api/expenses"))).status).toBe(403);
    expect((await list.POST(form({ vendor: "A", amount: "5", date: "2026-11-01" }))).status).toBe(403);
    expect((await summary.GET(new Request("http://x/api/expenses/summary"))).status).toBe(403);
    expect((await bulk.POST(json("http://x/api/expenses/bulk", { ids: ["a"], action: "DELETE" }))).status).toBe(403);
    expect(mocks.deleteExpenses).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("deleting needs the delete permission, not just create", async () => {
    const { POST } = await import("@/app/api/expenses/bulk/route");
    mocks.deleteExpenses.mockResolvedValue({ ok: true, deleted: 1 });
    await POST(json("http://x/api/expenses/bulk", { ids: ["a"], action: "DELETE" }));
    expect(mocks.requireExpenseAccess).toHaveBeenCalledWith("expenses.delete");
    await POST(json("http://x/api/expenses/bulk", { ids: ["a"], action: "SET_CATEGORY", value: "Other" }));
    expect(mocks.requireExpenseAccess).toHaveBeenLastCalledWith("expenses.create");
  });

  it("rejects bad pagination and an empty or unknown bulk request", async () => {
    const list = await import("@/app/api/expenses/route");
    expect((await list.GET(new Request("http://x/api/expenses?limit=abc"))).status).toBe(400);
    expect((await list.GET(new Request("http://x/api/expenses?page=0"))).status).toBe(400);
    const bulk = await import("@/app/api/expenses/bulk/route");
    expect((await bulk.POST(json("http://x/api/expenses/bulk", { ids: [], action: "DELETE" }))).status).toBe(400);
    expect((await bulk.POST(json("http://x/api/expenses/bulk", { ids: ["a"], action: "NUKE" }))).status).toBe(400);
  });

  it("returns field issues instead of saving an invalid expense", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(form({ vendor: "", amount: "-4", date: "nope" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.fields.map((f: { field: string }) => f.field)).toEqual(expect.arrayContaining(["vendor", "amount", "date"]));
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("warns about a likely duplicate and saves when forced", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    mocks.findDuplicates.mockResolvedValue([{ id: "e9", vendor: "AWS", amount: 100, date: "2026-11-01T00:00:00.000Z", invoiceNo: null }]);
    const fields = { vendor: "AWS", amount: "100", date: "2026-11-01", category: "Hosting & Cloud" };
    const dup = await POST(form(fields));
    expect(dup.status).toBe(409);
    expect((await dup.json()).existing[0].id).toBe("e9");
    expect(mocks.createExpense).not.toHaveBeenCalled();
    mocks.createExpense.mockResolvedValue({ id: "e10" });
    const forced = await POST(form({ ...fields, force: "true" }));
    expect(forced.status).toBe(201);
    expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({ vendor: "AWS", amount: 100, workspaceId: "ws_1" }));
  });

  it("approving needs the approve permission, not just create", async () => {
    const { POST } = await import("@/app/api/expenses/bulk/route");
    await POST(json("http://x/api/expenses/bulk", { ids: ["a"], action: "APPROVE" }));
    expect(mocks.requireExpenseAccess).toHaveBeenLastCalledWith("expenses.approve");
    await POST(json("http://x/api/expenses/bulk", { ids: ["a"], action: "REJECT", reason: "no" }));
    expect(mocks.requireExpenseAccess).toHaveBeenLastCalledWith("expenses.approve");
  });

  it("rules and budgets can only be changed by approvers", async () => {
    mocks.requireExpenseAccess.mockResolvedValue(denied);
    const settings = await import("@/app/api/expenses/settings/route");
    const budgets = await import("@/app/api/expenses/budgets/route");
    const patch = new Request("http://x/api/expenses/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalRequired: true }) });
    expect((await settings.PATCH(patch)).status).toBe(403);
    const put = new Request("http://x/api/expenses/budgets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "*", monthlyAmount: 100 }) });
    expect((await budgets.PUT(put)).status).toBe(403);
  });

  it("the inbound mail address answers 404 for an unknown or switched-off token", async () => {
    const { POST } = await import("@/app/api/expenses/inbound/[token]/route");
    const res = await POST(new Request("http://x/api/expenses/inbound/abc", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), { params: Promise.resolve({ token: "a-token-that-is-long-enough" }) });
    expect(res.status).toBe(404);
  });
});
