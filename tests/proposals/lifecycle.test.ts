import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { canOwnerTransition, getDisplayStatus, isEditable, isExpired } from "@/lib/proposals/status";
import { buildBaseWhere, buildListWhere, parseProposalListQuery } from "@/lib/proposals/query";
import { buildTimeline } from "@/lib/proposals/events";
import { scaleMilestones, totalsForSelection } from "@/lib/proposals/public";
import { serializePublic } from "@/lib/proposals/serialize";
import { checkMilestones } from "@/lib/proposals/totals";
import { proposalInputSchema } from "@/lib/proposals/validation";

const D = (v: string | number) => new Prisma.Decimal(v);
const now = new Date("2026-11-08T10:00:00Z");

describe("status rules", () => {
  it("only allows the documented owner transitions", () => {
    expect(canOwnerTransition("SENT", "DECLINED")).toBe(true);
    expect(canOwnerTransition("DECLINED", "DRAFT")).toBe(true);
    expect(canOwnerTransition("DRAFT", "ACCEPTED")).toBe(false);
    expect(canOwnerTransition("ACCEPTED", "DRAFT")).toBe(false);
    expect(canOwnerTransition("SENT", "INVOICED")).toBe(false);
    expect(canOwnerTransition("SENT", "garbage")).toBe(false);
  });

  it("treats the validUntil day as still valid and derives EXPIRED only for open proposals", () => {
    expect(isExpired("SENT", new Date("2026-11-08T00:00:00Z"), now)).toBe(false);
    expect(isExpired("SENT", new Date("2026-11-07T23:59:00Z"), now)).toBe(true);
    expect(getDisplayStatus("VIEWED", new Date("2026-11-01T00:00:00Z"), now)).toBe("EXPIRED");
    expect(getDisplayStatus("ACCEPTED", new Date("2026-11-01T00:00:00Z"), now)).toBe("ACCEPTED");
    expect(getDisplayStatus("DRAFT", new Date("2026-11-01T00:00:00Z"), now)).toBe("DRAFT");
  });

  it("locks accepted and invoiced proposals", () => {
    expect(isEditable("SENT")).toBe(true);
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("ACCEPTED")).toBe(false);
    expect(isEditable("INVOICED")).toBe(false);
  });
});

describe("list query", () => {
  it("caps limit, parses status lists and rejects unknown statuses", () => {
    const ok = parseProposalListQuery(new URLSearchParams("limit=50&status=SENT,VIEWED&sort=totalAmount&dir=asc"));
    expect(ok.success && ok.data.status).toEqual(["SENT", "VIEWED"]);
    expect(parseProposalListQuery(new URLSearchParams("limit=5000")).success).toBe(false);
    expect(parseProposalListQuery(new URLSearchParams("status=BOGUS")).success).toBe(false);
    expect(parseProposalListQuery(new URLSearchParams("sort=declineReason")).success).toBe(false);
  });

  it("always scopes to the workspace and splits EXPIRED from open statuses by date", () => {
    const q = parseProposalListQuery(new URLSearchParams("status=SENT,EXPIRED&q=acme"));
    if (!q.success) throw new Error("bad query");
    const base = buildBaseWhere("ws_1", q.data);
    expect(base.workspaceId).toBe("ws_1");
    const where = JSON.stringify(buildListWhere("ws_1", q.data, now));
    expect(where).toContain('"validUntil":{"gte"');
    expect(where).toContain('"validUntil":{"lt"');
    expect(where).toContain('"archivedAt":null');
  });
});

describe("timeline", () => {
  it("synthesises legacy lifecycle moments but prefers recorded events", () => {
    const t = buildTimeline(
      { dateCreated: new Date("2026-10-01"), sentAt: new Date("2026-10-02"), firstViewedAt: new Date("2026-10-03"), acceptedAt: null, declinedAt: null, firstConvertedAt: null, status: "VIEWED" },
      [{ id: "e1", type: "VIEWED", message: null, createdAt: new Date("2026-10-03T05:00:00Z") }],
    );
    expect(t.map((e) => e.type)).toEqual(["VIEWED", "SENT", "CREATED"]);
  });
});

describe("accepting with optional lines", () => {
  const stored = { subtotal: D(1500), estimatedTax: D(270), totalAmount: D(1770), taxRatePercent: 18 };
  const lines = [
    { id: "a", total: D(1000), isOptional: false },
    { id: "b", total: D(500), isOptional: true },
  ];

  it("keeps the quoted totals when every line stays", () => {
    const r = totalsForSelection(stored, lines, new Set(["b"]));
    expect(r.totalAmount.toFixed(2)).toBe("1770.00");
    expect(r.chosenIds).toEqual(["a", "b"]);
  });

  it("drops an unticked optional line and re-derives tax from the stored rate", () => {
    const r = totalsForSelection(stored, lines, new Set());
    expect(r.subtotal.toFixed(2)).toBe("1000.00");
    expect(r.estimatedTax.toFixed(2)).toBe("180.00");
    expect(r.totalAmount.toFixed(2)).toBe("1180.00");
    expect(r.chosenIds).toEqual(["a"]);
  });

  it("scales milestones to the new total with the last one absorbing rounding", () => {
    const out = scaleMilestones([D(1000), D(770)], D(1770), D(1180));
    expect(out.reduce((a, b) => a.plus(b), D(0)).toFixed(2)).toBe("1180.00");
  });
});

describe("milestone check", () => {
  it("requires milestones to add up to the total", () => {
    expect(checkMilestones([], D(100))).toBeNull();
    expect(checkMilestones([{ amount: 60 }, { amount: 40 }], D(100))).toBeNull();
    expect(checkMilestones([{ amount: 60 }, { amount: 30 }], D(100))).toMatch(/add up/);
  });
});

describe("input validation", () => {
  const base = { clientId: "c1", title: "Site", validUntil: "2026-12-01", items: [{ title: "Design", quantity: 1, unitPrice: 100 }] };
  it("accepts a minimal proposal and applies defaults", () => {
    const r = proposalInputSchema.safeParse(base);
    expect(r.success && r.data.items[0].isOptional).toBe(false);
  });
  it("rejects empty items, negative prices, bad dates and unsafe media links", () => {
    expect(proposalInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(proposalInputSchema.safeParse({ ...base, items: [{ title: "x", quantity: 1, unitPrice: -1 }] }).success).toBe(false);
    expect(proposalInputSchema.safeParse({ ...base, validUntil: "not-a-date" }).success).toBe(false);
    expect(proposalInputSchema.safeParse({ ...base, richMedia: [{ type: "image", url: "javascript:alert(1)" }] }).success).toBe(false);
  });
});

describe("public DTO", () => {
  it("exposes only whitelisted fields", () => {
    const row = {
      id: "p1", workspaceId: "ws_secret", clientId: "c1", proposalNo: "EST-26-001", title: "Site", status: "SENT",
      currency: "INR", subtotal: D(100), estimatedTax: D(18), totalAmount: D(118), taxRatePercent: 18,
      validUntil: new Date("2026-12-01"), acceptedAt: null, clientIp: "1.2.3.4", declineReason: "internal", clientSignatureBase64: "sig",
      publicToken: "tok", richSections: [{ title: "Scope", body: "x", mediaUrl: "" }], richMedia: null,
      client: { name: "Acme" }, items: [], billingMilestones: [], events: [],
    } as unknown as Parameters<typeof serializePublic>[0];
    const dto = serializePublic(row, { name: "Me Ltd", logoUrl: null, taxLabel: "GST" }, now);
    const text = JSON.stringify(dto);
    for (const leak of ["ws_secret", "1.2.3.4", "internal", "clientIp", "publicToken", "workspaceId", "sig\""]) expect(text).not.toContain(leak);
    expect(dto.clientName).toBe("Acme");
    expect(dto.totalAmount).toBe("118.00");
  });
});
