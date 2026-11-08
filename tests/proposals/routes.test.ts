// @vitest-environment node
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const proposal = { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn() };
  const tx = {
    proposal: { updateMany: vi.fn() },
    proposalItem: { update: vi.fn() },
    billingMilestone: { findMany: vi.fn(), update: vi.fn() },
    proposalEvent: { create: vi.fn() },
  };
  return {
    requireProposalAccess: vi.fn(),
    proposal,
    tx,
    prisma: {
      proposal,
      proposalEvent: tx.proposalEvent,
      businessProfile: { findUnique: vi.fn() },
      invoice: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/proposals/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/proposals/access")>()),
  requireProposalAccess: mocks.requireProposalAccess,
}));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn(), noteDashboardCacheIncident: vi.fn() }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit-memory", () => ({ checkRateLimit: vi.fn(() => ({ ok: true })) }));

const access = { ok: true, access: { workspaceId: "ws_1", userId: "u_1", email: "owner@x.y" } };
const denied = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
const ctx = (id = "p1") => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/proposals/p1", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireProposalAccess.mockResolvedValue(access);
  mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
});

describe("owner routes enforce permissions", () => {
  it("rejects list, delete and status calls without the matching permission", async () => {
    mocks.requireProposalAccess.mockResolvedValue(denied);
    const list = await import("@/app/api/proposals/route");
    const one = await import("@/app/api/proposals/[id]/route");
    const status = await import("@/app/api/proposals/[id]/status/route");
    expect((await list.GET(new Request("http://localhost/api/proposals"))).status).toBe(403);
    expect((await one.DELETE(req("DELETE"), ctx())).status).toBe(403);
    expect((await status.PATCH(req("PATCH", { status: "DECLINED" }), ctx())).status).toBe(403);
    expect(mocks.proposal.deleteMany).not.toHaveBeenCalled();
    expect(mocks.proposal.updateMany).not.toHaveBeenCalled();
  });

  it("asks for the right permission per action", async () => {
    const status = await import("@/app/api/proposals/[id]/status/route");
    mocks.proposal.findFirst.mockResolvedValue({ status: "SENT" });
    mocks.proposal.updateMany.mockResolvedValue({ count: 1 });
    await status.PATCH(req("PATCH", { status: "ACCEPTED" }), ctx());
    expect(mocks.requireProposalAccess).toHaveBeenCalledWith("proposals.convert");
    await status.PATCH(req("PATCH", { status: "DECLINED" }), ctx());
    expect(mocks.requireProposalAccess).toHaveBeenLastCalledWith("proposals.edit");
  });
});

describe("PATCH /status", () => {
  it("rejects values outside the allowlist", async () => {
    const { PATCH } = await import("@/app/api/proposals/[id]/status/route");
    expect((await PATCH(req("PATCH", { status: "INVOICED" }), ctx())).status).toBe(400);
    expect((await PATCH(req("PATCH", { status: "whatever" }), ctx())).status).toBe(400);
    expect(mocks.proposal.updateMany).not.toHaveBeenCalled();
  });

  it("blocks illegal transitions such as reopening an accepted proposal", async () => {
    const { PATCH } = await import("@/app/api/proposals/[id]/status/route");
    mocks.proposal.findFirst.mockResolvedValue({ status: "ACCEPTED" });
    const res = await PATCH(req("PATCH", { status: "DRAFT" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_TRANSITION");
    expect(mocks.proposal.updateMany).not.toHaveBeenCalled();
  });

  it("compare-and-sets on the status it validated and stamps the decline", async () => {
    const { PATCH } = await import("@/app/api/proposals/[id]/status/route");
    mocks.proposal.findFirst.mockResolvedValue({ status: "VIEWED" });
    mocks.proposal.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(req("PATCH", { status: "DECLINED", note: "Budget" }), ctx());
    expect(res.status).toBe(200);
    const arg = mocks.proposal.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "p1", workspaceId: "ws_1", status: "VIEWED" });
    expect(arg.data.declinedAt).toBeInstanceOf(Date);
  });
});

describe("DELETE", () => {
  it("never hard-deletes an accepted or invoiced proposal", async () => {
    const { DELETE } = await import("@/app/api/proposals/[id]/route");
    mocks.proposal.findFirst.mockResolvedValue({ status: "ACCEPTED", _count: { generatedInvoices: 0, generatedRetainers: 0, conversions: 0 } });
    const res = await DELETE(req("DELETE"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).archivable).toBe(true);
    expect(mocks.proposal.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes an untouched draft inside the workspace", async () => {
    const { DELETE } = await import("@/app/api/proposals/[id]/route");
    mocks.proposal.findFirst.mockResolvedValue({ status: "DRAFT", _count: { generatedInvoices: 0, generatedRetainers: 0, conversions: 0 } });
    mocks.proposal.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(200);
    expect(mocks.proposal.deleteMany.mock.calls[0][0].where).toMatchObject({ id: "p1", workspaceId: "ws_1" });
  });
});

const publicRow = (over: Record<string, unknown> = {}) => ({
  id: "p1", workspaceId: "ws_1", proposalNo: "EST-26-001", title: "Site", status: "SENT", archivedAt: null,
  validUntil: new Date(Date.now() + 5 * 86_400_000), subtotal: new Prisma.Decimal(1500), estimatedTax: new Prisma.Decimal(270),
  totalAmount: new Prisma.Decimal(1770), taxRatePercent: 18, currency: "INR", acceptedAt: null, richSections: null, richMedia: null,
  client: { name: "Acme" }, billingMilestones: [], events: [],
  items: [
    { id: "a", title: "A", description: null, quantity: 1, unitPrice: new Prisma.Decimal(1000), total: new Prisma.Decimal(1000), isOptional: false, isSelected: true },
    { id: "b", title: "B", description: null, quantity: 1, unitPrice: new Prisma.Decimal(500), total: new Prisma.Decimal(500), isOptional: true, isSelected: true },
  ],
  ...over,
});

describe("public share link", () => {
  const patch = (body: unknown) =>
    import("@/app/api/p/[token]/route").then(({ PATCH }) =>
      PATCH(new Request("http://localhost/api/p/tok", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ token: "tok" }) }),
    );

  it("hides drafts from the client", async () => {
    mocks.proposal.findUnique.mockResolvedValue(publicRow({ status: "DRAFT" }));
    const { GET } = await import("@/app/api/p/[token]/route");
    const res = await GET(new Request("http://localhost/api/p/tok"), { params: Promise.resolve({ token: "tok" }) });
    expect(res.status).toBe(404);
  });

  it("refuses acceptance with the wrong verification email", async () => {
    mocks.proposal.findUnique.mockResolvedValueOnce(publicRow()).mockResolvedValueOnce({ ...publicRow(), client: { name: "Acme", email: "buyer@acme.com" } });
    const res = await patch({ email: "someone@else.com" });
    expect(res.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses acceptance after expiry", async () => {
    mocks.proposal.findUnique.mockResolvedValue(publicRow({ validUntil: new Date(Date.now() - 3 * 86_400_000) }));
    expect((await patch({ email: "buyer@acme.com" })).status).toBe(403);
  });

  it("accepts atomically, drops an unticked optional line and rescales the total", async () => {
    mocks.proposal.findUnique.mockResolvedValueOnce(publicRow()).mockResolvedValueOnce({ ...publicRow(), client: { name: "Acme", email: "buyer@acme.com" } });
    mocks.tx.proposal.updateMany.mockResolvedValue({ count: 1 });
    const res = await patch({ email: "Buyer@Acme.com", selectedItemIds: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).totalAmount).toBe("1180.00");
    const claim = mocks.tx.proposal.updateMany.mock.calls[0][0];
    expect(claim.where.status.in).toEqual(["SENT", "VIEWED", "REVISION_REQUESTED"]);
    expect(claim.data.status).toBe("ACCEPTED");
    expect(mocks.tx.proposalItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { isSelected: false } });
  });

  it("returns 409 and writes nothing else when someone else already moved the proposal", async () => {
    mocks.proposal.findUnique.mockResolvedValueOnce(publicRow()).mockResolvedValueOnce({ ...publicRow(), client: { name: "Acme", email: "buyer@acme.com" } });
    mocks.tx.proposal.updateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ email: "buyer@acme.com" })).status).toBe(409);
    expect(mocks.tx.proposalItem.update).not.toHaveBeenCalled();
  });

  it("stores revision feedback as an event, never in declineReason", async () => {
    mocks.proposal.findUnique.mockResolvedValue(publicRow());
    mocks.tx.proposal.updateMany.mockResolvedValue({ count: 1 });
    const { PATCH } = await import("@/app/api/p/[token]/status/route");
    const res = await PATCH(
      new Request("http://localhost/api/p/tok/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "REVISION_REQUESTED", clientNote: "Add training" }) }),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(res.status).toBe(200);
    expect(mocks.tx.proposal.updateMany.mock.calls[0][0].data).toEqual({ status: "REVISION_REQUESTED" });
    expect(mocks.tx.proposalEvent.create.mock.calls[0][0].data).toMatchObject({ type: "REVISION_REQUESTED", message: "Add training" });
  });
});

describe("convertProposal", () => {
  it("is idempotent: returns the existing invoice instead of creating another", async () => {
    mocks.prisma.invoice.findFirst.mockResolvedValue({ id: "i1", invoiceNumber: "INV-001" });
    const { convertProposal } = await import("@/lib/proposals/convert");
    const r = await convertProposal({ workspaceId: "ws_1", proposalId: "p1", actorUserId: "u_1" });
    expect(r).toMatchObject({ ok: true, alreadyConverted: true, invoice: { id: "i1" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to invoice a proposal the client has not accepted", async () => {
    mocks.prisma.invoice.findFirst.mockResolvedValue(null);
    mocks.proposal.findFirst.mockResolvedValue({ id: "p1", status: "SENT", items: [], billingMilestones: [], client: {}, workspace: {} });
    const { convertProposal } = await import("@/lib/proposals/convert");
    const r = await convertProposal({ workspaceId: "ws_1", proposalId: "p1", actorUserId: "u_1" });
    expect(r).toMatchObject({ ok: false, code: "PROPOSAL_NOT_ACCEPTED", status: 409 });
  });
});
