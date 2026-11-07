import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildBaseWhere, buildListWhere, buildOrderBy, invoiceListQuerySchema, parseInvoiceListQuery } from "@/lib/invoices/query";
import { balanceOf, effectiveTotal, getDisplayStatus, toListItem } from "@/lib/invoices/serialize";
import { fyLabelFor, fyRangeFromLabel, previousPeriod, resolvePeriod } from "@/lib/invoices/period";
import { isStaleDeployError } from "@/lib/errors/stale-deploy";
import { billedInBase } from "@/lib/invoices/summary";

const D = (v: number | string) => new Prisma.Decimal(v);

describe("period helpers", () => {
  it("maps dates to April–March financial years", () => {
    expect(fyLabelFor(new Date("2026-03-31T10:00:00Z"))).toBe("25-26");
    expect(fyLabelFor(new Date("2026-04-01T00:00:00Z"))).toBe("26-27");
    expect(fyLabelFor(new Date("2026-11-07T00:00:00Z"))).toBe("26-27");
  });

  it("builds [from, to) ranges and rejects malformed labels", () => {
    const range = fyRangeFromLabel("26-27")!;
    expect(range.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2027-04-01T00:00:00.000Z");
    expect(fyRangeFromLabel("26-28")).toBeNull();
    expect(fyRangeFromLabel("2026")).toBeNull();
  });

  it("previous period has the same length and ends where the current one starts", () => {
    const range = fyRangeFromLabel("26-27")!;
    const prev = previousPeriod(range);
    expect(prev.to.getTime()).toBe(range.from.getTime());
    expect(prev.to.getTime() - prev.from.getTime()).toBe(range.to.getTime() - range.from.getTime());
  });

  it("falls back to the current FY for bad input", () => {
    expect(resolvePeriod({ fy: "nonsense" }, new Date("2026-11-07T00:00:00Z")).label).toBe("26-27");
    expect(resolvePeriod({ fy: "25-26" }).label).toBe("25-26");
  });
});

describe("invoice money + status", () => {
  it("uses totalAmount when a legacy row has grandTotal = 0 (the KPI mismatch bug)", () => {
    expect(effectiveTotal({ grandTotal: D(0), totalAmount: D(45000) }).toString()).toBe("45000");
    expect(effectiveTotal({ grandTotal: D(1180), totalAmount: D(1000) }).toString()).toBe("1180");
  });

  it("never returns a negative balance and zeroes void invoices", () => {
    expect(balanceOf(D(100), D(150), "PAID").toString()).toBe("0");
    expect(balanceOf(D(100), D(40), "PARTIALLY_PAID").toString()).toBe("60");
    expect(balanceOf(D(100), D(0), "VOID").toString()).toBe("0");
  });

  it("derives OVERDUE only for open invoices past their due date", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const yesterday = new Date("2026-11-06T00:00:00Z");
    const today = new Date("2026-11-07T00:00:00Z");
    expect(getDisplayStatus("PENDING", yesterday, D(10), now)).toBe("OVERDUE");
    expect(getDisplayStatus("PARTIALLY_PAID", yesterday, D(10), now)).toBe("OVERDUE");
    expect(getDisplayStatus("PENDING", today, D(10), now)).toBe("PENDING");
    expect(getDisplayStatus("PENDING", null, D(10), now)).toBe("PENDING");
    expect(getDisplayStatus("PAID", yesterday, D(0), now)).toBe("PAID");
    expect(getDisplayStatus("VOID", yesterday, D(0), now)).toBe("VOID");
  });

  it("maps a row to a list DTO with base-currency total and days overdue", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const dto = toListItem(
      {
        id: "i1",
        invoiceNumber: "INV/26-27/001",
        invoiceDate: new Date("2026-10-01T00:00:00Z"),
        dueDate: new Date("2026-11-02T00:00:00Z"),
        clientId: "c1",
        clientName: "Acme",
        currency: "USD",
        exchangeRate: D(83.5),
        grandTotal: D(0),
        totalAmount: D(100),
        baseGrandTotal: null,
        amountReceived: D(40),
        status: "PARTIALLY_PAID",
        source: "MANUAL",
        sourceProposalId: null,
        providerGateway: null,
        providerPaymentLinkId: null,
        sentAt: null,
        lastReminderSentAt: null,
        createdAt: new Date("2026-10-01T00:00:00Z"),
        pdfPath: "/invoices/ws/x.pdf",
      },
      now,
    );
    expect(dto.grandTotal).toBe("100.00");
    expect(dto.balance).toBe("60.00");
    expect(dto.baseGrandTotal).toBe("8350.00");
    expect(dto.displayStatus).toBe("OVERDUE");
    expect(dto.daysOverdue).toBe(5);
  });
});

describe("invoice list query", () => {
  const parse = (qs: string) => parseInvoiceListQuery(new URLSearchParams(qs));

  it("clamps/validates paging so a bad value can no longer crash or dump the table", () => {
    expect(parse("limit=999999").success).toBe(false);
    expect(parse("page=0").success).toBe(false);
    expect(parse("page=-5&limit=abc").success).toBe(false);
    const ok = parse("page=3&limit=50");
    expect(ok.success && ok.data.page).toBe(3);
  });

  it("accepts comma and repeated list params, rejects unknown statuses", () => {
    const a = parse("status=OVERDUE,PAID");
    expect(a.success && a.data.status).toEqual(["OVERDUE", "PAID"]);
    const b = parse("status=OVERDUE&status=VOID");
    expect(b.success && b.data.status).toEqual(["OVERDUE", "VOID"]);
    expect(parse("status=BOGUS").success).toBe(false);
  });

  it("scopes every query to the workspace and applies filters", () => {
    const q = invoiceListQuerySchema.parse({ q: "acme", clientId: "c1", currency: "usd", fy: "26-27", source: "POS" });
    const where = buildBaseWhere("ws_1", q) as { workspaceId: string; AND: unknown[] };
    expect(where.workspaceId).toBe("ws_1");
    expect(JSON.stringify(where.AND)).toContain("acme");
    expect(JSON.stringify(where.AND)).toContain('"currency":"USD"');
    expect(JSON.stringify(where.AND)).toContain("2026-04-01");
  });

  it("builds overdue/pending status conditions that agree with the derived status", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const q = invoiceListQuerySchema.parse({ status: "OVERDUE" });
    const where = JSON.stringify(buildListWhere("ws_1", q, now));
    expect(where).toContain('"PENDING","PARTIALLY_PAID"');
    expect(where).toContain("2026-11-07T00:00:00.000Z");
  });

  it("uses a stable tie-breaker for ordering", () => {
    const q = invoiceListQuerySchema.parse({ sort: "amount", dir: "asc" });
    expect(buildOrderBy(q)).toEqual([{ baseGrandTotal: "asc" }, { id: "asc" }]);
  });
});

describe("stale deploy detection", () => {
  it("recognises chunk load failures", () => {
    expect(isStaleDeployError({ name: "ChunkLoadError", message: "x" })).toBe(true);
    expect(isStaleDeployError({ message: "TypeError: boom" })).toBe(false);
  });
});

describe("billedInBase (KPI maths)", () => {
  it("coalesces per row, so legacy zero-grandTotal rows still count (previously 0)", () => {
    const legacy = { grandTotal: D(0), totalAmount: D(1000), baseGrandTotal: null, exchangeRate: D(1) };
    const modern = { grandTotal: D(1180), totalAmount: D(1000), baseGrandTotal: null, exchangeRate: D(1) };
    expect(billedInBase(legacy).plus(billedInBase(modern)).toString()).toBe("2180");
  });

  it("uses the stored base amount, or converts at the saved rate", () => {
    expect(billedInBase({ grandTotal: D(100), totalAmount: D(100), baseGrandTotal: D(8350), exchangeRate: D(83.5) }).toString()).toBe("8350");
    expect(billedInBase({ grandTotal: D(100), totalAmount: D(100), baseGrandTotal: null, exchangeRate: D(83.5) }).toString()).toBe("8350");
  });
});
