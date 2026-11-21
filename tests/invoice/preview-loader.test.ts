import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dec = (n: number) => new Prisma.Decimal(n);

const profileRow = { ...SAMPLE_INVOICES.basic.profile, workspaceId: "ws1", upiVpa: "shop@okhdfc", upiPayeeName: "Baba", primaryBankAccount: null };
const invoiceRow = (id: string, workspaceId: string, over: Record<string, unknown> = {}) => ({
  id, workspaceId, invoiceNumber: `INV-${id}`, invoiceDate: day("2026-04-27"), dueDate: day("2026-05-04"), billingMonth: "April 2026",
  clientName: "Acme", clientId: "c1", sacCode: "998313", status: "PENDING", currency: "INR",
  subtotal: dec(1000), taxRate: 0.18, taxAmount: dec(180), grandTotal: dec(1180), totalAmount: dec(1180), taxMode: "taxable",
  gstPlaceOfSupply: "29", gstReverseCharge: false, gstSupplyOverride: null, irn: null, irnAckNo: null, irnAckDate: null,
  accentColor: null, tdsSection: null, tdsRatePercent: null, tdsAmount: null,
  items: [{ description: "Work", quantity: 1, unitPrice: dec(1000), taxRate: 0.18, sacCode: "998313", totalAmount: dec(1000) }],
  payments: [], client: { name: "Acme", address: "Addr", country: "IN", email: null, taxId: null, isExport: false, logoUrl: null, invoiceAccentColor: null, gstStateCode: "29" },
  ...over,
});

const calls: Array<{ model: string; where: Record<string, unknown> }> = [];
let invoices: ReturnType<typeof invoiceRow>[] = [];
let profile: typeof profileRow | null = profileRow;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    businessProfile: { findUnique: async () => profile },
    paymentQrImage: { findMany: async () => [{ label: "Paytm", imagePath: "/payment-qr/ws1/p.png", sortOrder: 0 }] },
    invoice: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        calls.push({ model: "invoice", where });
        const list = invoices.filter((i) => i.workspaceId === where.workspaceId && (where.id === undefined || i.id === where.id) && (where.status === undefined || i.status !== "VOID"));
        return list[0] ?? null;
      },
      findMany: async () => [],
    },
  },
}));

import { loadPreviewParams } from "@/lib/invoice/preview-loader";

beforeEach(() => { calls.length = 0; invoices = []; profile = profileRow; });

describe("loadPreviewParams", () => {
  it("loads the latest non-void invoice of the workspace when no id is given", async () => {
    invoices = [invoiceRow("a", "ws1")];
    const r = await loadPreviewParams({ workspaceId: "ws1", invoiceId: null, design: "DESIGN_3" });
    expect(r?.isSample).toBe(false);
    expect(r?.invoice).toMatchObject({ id: "a", number: "INV-a", clientName: "Acme" });
    expect(r?.params.totals.total).toBe(1180);
    expect(calls[0].where).toMatchObject({ workspaceId: "ws1", status: { not: "VOID" } });
  });

  it("scopes an explicit id to the caller's workspace and returns null for someone else's invoice", async () => {
    invoices = [invoiceRow("theirs", "ws2")];
    expect(await loadPreviewParams({ workspaceId: "ws1", invoiceId: "theirs", design: "DESIGN_3" })).toBeNull();
    expect(calls[0].where).toMatchObject({ id: "theirs", workspaceId: "ws1" });
  });

  it("falls back to a labelled sample, with the workspace's own business details, when there are no invoices", async () => {
    const r = await loadPreviewParams({ workspaceId: "ws1", invoiceId: null, design: "DESIGN_3" });
    expect(r?.isSample).toBe(true);
    expect(r?.invoice).toBeNull();
    expect(r?.params.profile.companyName).toBe(profileRow.companyName);
    expect(r?.params.totals.total).toBeGreaterThan(0);
  });

  it("includes UPI and QR images only for the designs that draw them", async () => {
    invoices = [invoiceRow("a", "ws1")];
    const payfast = await loadPreviewParams({ workspaceId: "ws1", invoiceId: null, design: "DESIGN_4" });
    expect(payfast?.params.upi?.vpa).toBe("shop@okhdfc");
    expect(payfast?.params.staticQrs).toHaveLength(1);
    const tax = await loadPreviewParams({ workspaceId: "ws1", invoiceId: null, design: "DESIGN_3" });
    expect(tax?.params.upi).toBeUndefined();
    expect(tax?.params.staticQrs).toBeUndefined();
  });

  it("never carries a payment link", async () => {
    invoices = [invoiceRow("a", "ws1")];
    const r = await loadPreviewParams({ workspaceId: "ws1", invoiceId: null, design: "DESIGN_4" });
    expect(r?.params.paymentLink ?? null).toBeNull();
  });

  it("renders a sample when the workspace has no business profile yet", async () => {
    profile = null;
    const r = await loadPreviewParams({ workspaceId: "ws1", invoiceId: null, design: "DESIGN_3" });
    expect(r?.isSample).toBe(true);
  });
});
