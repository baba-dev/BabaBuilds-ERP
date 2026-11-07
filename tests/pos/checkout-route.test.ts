import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isModuleEnabled: vi.fn(),
  withPermission: vi.fn(),
  getNextInvoiceNumber: vi.fn(),
  getNextProposalNo: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
  },
  tx: {
    client: { findFirst: vi.fn(), create: vi.fn() },
    serviceTemplate: { findMany: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn() },
    businessProfile: { findUnique: vi.fn() },
    invoice: { create: vi.fn() },
    proposal: { create: vi.fn() },
    retainer: { create: vi.fn() },
  },
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: mocks.isModuleEnabled }));
vi.mock("@/lib/rbac", () => ({ withPermission: mocks.withPermission }));
vi.mock("@/lib/document-numbering", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-numbering")>()),
  getNextInvoiceNumber: mocks.getNextInvoiceNumber,
  getNextProposalNo: mocks.getNextProposalNo,
}));

const { tx } = mocks;

function checkout(body: unknown) {
  return new Request("http://localhost:3000/api/pos/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/pos/checkout/route");
  return POST(checkout(body));
}

describe("POST /api/pos/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerSession.mockResolvedValue({ workspaceId: "ws_current", user: { id: "user_1" } });
    mocks.isModuleEnabled.mockResolvedValue(true);
    mocks.withPermission.mockResolvedValue({ granted: true, role: "OWNER" });
    mocks.getNextInvoiceNumber.mockResolvedValue({ invoiceNumber: "INV-0001", financialYear: "26-27" });
    mocks.getNextProposalNo.mockResolvedValue("PRO-0001");
    mocks.prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.client.findFirst.mockResolvedValue({ id: "client_current", name: "Current Workspace Client" });
    tx.client.create.mockResolvedValue({ id: "client_walkin", name: "Walk-in Customer" });
    tx.serviceTemplate.findMany.mockResolvedValue([]);
    tx.product.findMany.mockResolvedValue([]);
    tx.businessProfile.findUnique.mockResolvedValue({ invoicePrefix: "BB" });
    tx.invoice.create.mockResolvedValue({ id: "invoice_1" });
    tx.proposal.create.mockResolvedValue({ id: "proposal_1" });
    tx.retainer.create.mockResolvedValue({ id: "retainer_1" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);
    expect((await post({ action: "PAY_NOW", items: [] })).status).toBe(401);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects checkout when the POS module is disabled", async () => {
    mocks.isModuleEnabled.mockResolvedValueOnce(false);
    const response = await post({ action: "PAY_NOW", items: [{ type: "CUSTOM", name: "Widget", price: 10, quantity: 1 }] });
    expect(response.status).toBe(403);
    expect(mocks.isModuleEnabled).toHaveBeenCalledWith("ws_current", "POS");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns the RBAC response when the checkout permission is denied", async () => {
    mocks.withPermission.mockResolvedValueOnce({
      granted: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await post({ action: "PAY_NOW", items: [{ type: "CUSTOM", name: "Widget", price: 10, quantity: 1 }] });
    expect(response.status).toBe(403);
    expect(mocks.withPermission).toHaveBeenCalledWith("user_1", "ws_current", "pos.checkout");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a client id that is not scoped to the session workspace", async () => {
    tx.client.findFirst.mockResolvedValueOnce(null);

    const response = await post({
      action: "INVOICE",
      clientId: "client_other_workspace",
      items: [{ type: "CUSTOM", name: "Widget", price: 10, quantity: 1 }],
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Client not found" });
    expect(tx.client.findFirst).toHaveBeenCalledWith({
      where: { id: "client_other_workspace", workspaceId: "ws_current" },
    });
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.proposal.create).not.toHaveBeenCalled();
    expect(tx.retainer.create).not.toHaveBeenCalled();
  });

  it("creates downstream records with the scoped client id", async () => {
    const response = await post({
      action: "PAY_NOW",
      clientId: "client_current",
      items: [{ type: "CUSTOM", name: "Widget", price: 10, quantity: 2 }],
    });

    expect(response.status).toBe(200);
    expect(tx.client.findFirst).toHaveBeenCalledWith({
      where: { id: "client_current", workspaceId: "ws_current" },
    });
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws_current",
          clientId: "client_current",
          clientName: "Current Workspace Client",
          invoiceNumber: "INV-0001",
          status: "PAID",
        }),
      }),
    );
  });

  it("numbers invoices with the workspace's configured prefix", async () => {
    await post({ action: "INVOICE", clientId: "client_current", items: [{ type: "CUSTOM", name: "Widget", price: 10, quantity: 1 }] });
    expect(mocks.getNextInvoiceNumber).toHaveBeenCalledWith(tx, "ws_current", expect.any(Date), "BB");
  });

  it("rejects a discount larger than the subtotal", async () => {
    const response = await post({
      action: "PAY_NOW",
      clientId: "client_current",
      discount: 50,
      items: [{ type: "CUSTOM", name: "Widget", price: 10, quantity: 1 }],
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Discount cannot exceed subtotal" });
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});
