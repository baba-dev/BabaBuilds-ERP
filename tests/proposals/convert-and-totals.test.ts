// @vitest-environment node
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const D = (v: string | number) => new Prisma.Decimal(v);

const mocks = vi.hoisted(() => {
  const tx = {
    proposal: { updateMany: vi.fn() },
    invoice: { create: vi.fn() },
    proposalConversion: { create: vi.fn() },
    retainer: { create: vi.fn() },
    billingMilestone: { updateMany: vi.fn() },
    proposalEvent: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      invoice: { findFirst: vi.fn() },
      proposal: { findFirst: vi.fn() },
      businessProfile: { findUnique: vi.fn() },
      client: { findFirst: vi.fn() },
      serviceTemplate: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("fs", () => ({ default: { promises: { writeFile: vi.fn(async () => undefined), unlink: vi.fn(async () => undefined) } } }));
vi.mock("@/lib/pdf/generator", () => ({ generateInvoicePDF: vi.fn(async () => new Uint8Array([1])) }));
vi.mock("@/lib/uploads/private-storage", () => ({ buildPrivatePath: (...a: unknown[]) => a.join("/"), ensureDir: vi.fn(async () => undefined) }));
vi.mock("@/lib/document-numbering", () => ({
  getNextInvoiceNumber: vi.fn(async () => ({ invoiceNumber: "INV/26-27/001" })),
  isUniqueConstraintError: () => false,
}));
vi.mock("@/lib/entitlements", () => ({ assertFreeTierMonthlyInvoiceAllowed: vi.fn(async () => null), canInjectGatewayPaymentLinks: () => false }));
vi.mock("@/lib/razorpay-links", () => ({ generateTenantPaymentLink: vi.fn() }));
vi.mock("@/lib/stripe-links", () => ({ generateStripePaymentLink: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));

const proposal = () => ({
  id: "p1",
  workspaceId: "ws_1",
  clientId: "c1",
  status: "ACCEPTED",
  title: "Site",
  currency: "USD",
  exchangeRate: D(83),
  taxRatePercent: 18,
  subtotal: D(1000),
  estimatedTax: D(180),
  totalAmount: D(1180),
  firstConvertedAt: null,
  client: { id: "c1", name: "Acme", email: "a@acme.test" },
  workspace: { planTier: "PRO", subscriptionStatus: "ACTIVE", subscriptionEndsAt: null, baseCurrency: "INR", countryCode: "IN" },
  billingMilestones: [],
  items: [
    { id: "i1", serviceTemplateId: null, title: "Hosting", quantity: 1, unitPrice: D(1000), total: D(1000), isOptional: false, isSelected: true, isRecurring: true },
    { id: "i2", serviceTemplateId: null, title: "Design add-on", quantity: 1, unitPrice: D(500), total: D(500), isOptional: true, isSelected: false, isRecurring: false },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.prisma.invoice.findFirst.mockResolvedValue(null);
  mocks.prisma.proposal.findFirst.mockResolvedValue(proposal());
  mocks.prisma.businessProfile.findUnique.mockResolvedValue({ invoicePrefix: "INV", defaultGateway: "RAZORPAY", companyName: "Me" });
  mocks.tx.proposal.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.invoice.create.mockResolvedValue({ id: "inv1", invoiceNumber: "INV/26-27/001" });
  mocks.tx.retainer.create.mockResolvedValue({ id: "ret1" });
});

describe("convertProposal", () => {
  it("bills only the lines the client kept, at the signed totals, currency and fractional tax rate", async () => {
    const { convertProposal } = await import("@/lib/proposals/convert");
    const r = await convertProposal({ workspaceId: "ws_1", proposalId: "p1", actorUserId: "u1", createRetainer: true });
    expect(r).toMatchObject({ ok: true, alreadyConverted: false, retainerId: "ret1" });

    const data = mocks.tx.invoice.create.mock.calls[0][0].data;
    expect(data.items.create).toHaveLength(1);
    expect(data.items.create[0]).toMatchObject({ description: "Hosting", taxRate: 0.18 });
    expect(data.taxRate).toBe(0.18);
    expect(String(data.grandTotal)).toBe("1180");
    expect(data.currency).toBe("USD");
    expect(String(data.baseGrandTotal)).toBe("97940");
    expect(data.source).toBe("PROPOSAL");
    expect(data.sourceProposalId).toBe("p1");

    // Claimed with a compare-and-set so two simultaneous conversions cannot both win.
    expect(mocks.tx.proposal.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "p1", status: "ACCEPTED" }, data: { status: "INVOICED" } });
    // Retainer only carries the recurring line, and stays a fraction too.
    expect(mocks.tx.retainer.create.mock.calls[0][0].data.items.create).toEqual([expect.objectContaining({ title: "Hosting", taxRate: 0.18 })]);
  });

  it("returns the winner's invoice when another request converted first", async () => {
    mocks.tx.proposal.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.invoice.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "inv9", invoiceNumber: "INV/26-27/009" });
    const { convertProposal } = await import("@/lib/proposals/convert");
    const r = await convertProposal({ workspaceId: "ws_1", proposalId: "p1", actorUserId: "u1" });
    expect(r).toMatchObject({ ok: true, alreadyConverted: true, invoice: { id: "inv9" } });
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled();
  });
});

describe("computeProposalTotals", () => {
  it("stores the tax rate as a percentage while pricing with the resolver's fraction", async () => {
    mocks.prisma.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme", email: "a@acme.test", isExport: false });
    mocks.prisma.businessProfile.findUnique.mockResolvedValue({ taxLabel: "GST", defaultTaxRate: 0.18, workspace: { countryCode: "IN" } });
    mocks.prisma.serviceTemplate.findMany.mockResolvedValue([]);
    const { computeProposalTotals } = await import("@/lib/proposals/totals");
    const r = await computeProposalTotals("ws_1", { clientId: "c1", items: [{ title: "A", quantity: 2, unitPrice: 500, isOptional: false, isRecurring: false, serviceTemplateId: null, description: null }], taxRateOverride: undefined });
    if (!r.ok) throw new Error(r.message);
    expect(r.totals.taxRatePercent).toBe(18);
    expect(r.totals.subtotal.toFixed(2)).toBe("1000.00");
    expect(r.totals.estimatedTax.toFixed(2)).toBe("180.00");
    expect(r.totals.totalAmount.toFixed(2)).toBe("1180.00");
  });

  it("zero-rates export clients", async () => {
    mocks.prisma.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme", email: null, isExport: true });
    mocks.prisma.businessProfile.findUnique.mockResolvedValue({ taxLabel: "GST", defaultTaxRate: 0.18, workspace: { countryCode: "IN" } });
    mocks.prisma.serviceTemplate.findMany.mockResolvedValue([]);
    const { computeProposalTotals } = await import("@/lib/proposals/totals");
    const r = await computeProposalTotals("ws_1", { clientId: "c1", items: [{ title: "A", quantity: 1, unitPrice: 100, isOptional: false, isRecurring: false, serviceTemplateId: null, description: null }], taxRateOverride: undefined });
    if (!r.ok) throw new Error(r.message);
    expect(r.totals.taxRatePercent).toBe(0);
    expect(r.totals.totalAmount.toFixed(2)).toBe("100.00");
  });
});
