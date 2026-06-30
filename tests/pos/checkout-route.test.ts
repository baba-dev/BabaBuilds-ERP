import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const clientFindFirstMock = vi.fn();
const clientCreateMock = vi.fn();
const invoiceCreateMock = vi.fn();
const proposalCreateMock = vi.fn();
const retainerCreateMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: {
      findFirst: clientFindFirstMock,
      create: clientCreateMock,
    },
    invoice: { create: invoiceCreateMock },
    proposal: { create: proposalCreateMock },
    retainer: { create: retainerCreateMock },
  },
}));

describe("POST /api/pos/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({ workspaceId: "ws_current" });
    clientFindFirstMock.mockResolvedValue({ id: "client_current", name: "Current Workspace Client" });
    clientCreateMock.mockResolvedValue({ id: "client_walkin", name: "Walk-in Customer" });
    invoiceCreateMock.mockResolvedValue({ id: "invoice_1" });
    proposalCreateMock.mockResolvedValue({ id: "proposal_1" });
    retainerCreateMock.mockResolvedValue({ id: "retainer_1" });
  });

  it("rejects a client id that is not scoped to the session workspace", async () => {
    clientFindFirstMock.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/pos/checkout/route");
    const response = await POST(
      new Request("http://localhost:3000/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "INVOICE",
          clientId: "client_other_workspace",
          items: [{ name: "Widget", price: 10, quantity: 1 }],
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Client not found" });
    expect(response.status).toBe(404);
    expect(clientFindFirstMock).toHaveBeenCalledWith({
      where: { id: "client_other_workspace", workspaceId: "ws_current" },
    });
    expect(invoiceCreateMock).not.toHaveBeenCalled();
    expect(proposalCreateMock).not.toHaveBeenCalled();
    expect(retainerCreateMock).not.toHaveBeenCalled();
  });

  it("creates downstream records with the scoped client id", async () => {
    const { POST } = await import("@/app/api/pos/checkout/route");
    const response = await POST(
      new Request("http://localhost:3000/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PAY_NOW",
          clientId: "client_current",
          items: [{ name: "Widget", price: 10, quantity: 2 }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(clientFindFirstMock).toHaveBeenCalledWith({
      where: { id: "client_current", workspaceId: "ws_current" },
    });
    expect(invoiceCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws_current",
          clientId: "client_current",
          clientName: "Current Workspace Client",
        }),
      }),
    );
  });
});
