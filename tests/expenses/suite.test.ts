import { describe, expect, it } from "vitest";
import { vendorKey } from "@/lib/expenses/vendor-key";
import { suggestTds } from "@/lib/expenses/tds";
import { agingBucket, billDueDate } from "@/lib/expenses/payables";
import { budgetCrossings, budgetLines, budgetState } from "@/lib/expenses/budgets";
import { dueDates, nextRun } from "@/lib/expenses/recurrence";
import { decideApproval } from "@/lib/expenses/settings";
import { billableAmount } from "@/lib/expenses/billable";
import { attachmentsFromJson } from "@/lib/expenses/inbox";
import { shapeScan } from "@/lib/expenses/scan";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("vendorKey", () => {
  it("treats spacing, punctuation and case as the same vendor", () => {
    expect(vendorKey("Acme Co.")).toBe(vendorKey(" ACME  co"));
    expect(vendorKey("Smith & Sons, Ltd")).toBe(vendorKey("smith sons ltd"));
    expect(vendorKey("   ")).toBe("");
  });
});

describe("suggestTds", () => {
  it("suggests by category and stays silent for foreign vendors and unknown categories", () => {
    expect(suggestTds({ category: "Sub-contractors", amount: 50_000 })).toMatchObject({ code: "194C", ratePercent: 1 });
    expect(suggestTds({ category: "Office & Rent", amount: 50_000 })).toMatchObject({ code: "194I", ratePercent: 10 });
    expect(suggestTds({ category: "Legal & professional", amount: 80_000 })?.code).toBe("194J");
    expect(suggestTds({ category: "Software Subscriptions", amount: 5_000 })).toBeNull();
    expect(suggestTds({ category: "Sub-contractors", amount: 50_000, foreign: true })).toBeNull();
  });
});

describe("billDueDate and ageing", () => {
  it("uses the bill's own due date first", () => {
    expect(billDueDate({ date: d("2026-10-01"), dueDate: d("2026-10-20") }).toISOString().slice(0, 10)).toBe("2026-10-20");
  });
  it("holds micro and small suppliers to the legal limit and others to their terms or 30 days", () => {
    expect(billDueDate({ date: d("2026-10-01"), vendorMsme: "MICRO", vendorAgreedDays: 60 }).toISOString().slice(0, 10)).toBe("2026-11-15"); // capped at 45
    expect(billDueDate({ date: d("2026-10-01"), vendorMsme: "SMALL" }).toISOString().slice(0, 10)).toBe("2026-10-16"); // 15 with no agreement
    expect(billDueDate({ date: d("2026-10-01"), vendorTermsDays: 14 }).toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(billDueDate({ date: d("2026-10-01") }).toISOString().slice(0, 10)).toBe("2026-10-31");
  });
  it("buckets by days late", () => {
    const now = d("2026-11-09");
    expect(agingBucket(d("2026-11-20"), now)).toBe("NOT_DUE");
    expect(agingBucket(d("2026-11-01"), now)).toBe("D1_30");
    expect(agingBucket(d("2026-09-20"), now)).toBe("D31_60");
    expect(agingBucket(d("2026-08-15"), now)).toBe("D61_90");
    expect(agingBucket(d("2026-05-01"), now)).toBe("D90_PLUS");
  });
});

describe("budgets", () => {
  it("flags near and over, and only reports a crossing once", () => {
    expect(budgetState(50, 100)).toBe("OK");
    expect(budgetState(80, 100)).toBe("NEAR");
    expect(budgetState(101, 100)).toBe("OVER");
    expect(budgetCrossings(70, 85, 100)).toBe("NEAR");
    expect(budgetCrossings(85, 90, 100)).toBeNull();
    expect(budgetCrossings(95, 120, 100)).toBe("OVER");
  });
  it("joins caps to spend, with the overall cap using total spend", () => {
    const lines = budgetLines([{ category: "Hosting & Cloud", monthlyAmount: 1000 }, { category: "*", monthlyAmount: 5000 }], { "Hosting & Cloud": 900 }, 4000);
    expect(lines[0]).toMatchObject({ category: "Hosting & Cloud", share: 90, state: "NEAR", remaining: 100 });
    expect(lines[1]).toMatchObject({ category: "*", spent: 4000, state: "NEAR" });
  });
});

describe("recurrence", () => {
  it("keeps the day of month and clamps short months", () => {
    expect(nextRun(d("2026-01-31"), "MONTHLY", 31).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(nextRun(d("2026-02-28"), "MONTHLY", 31).toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(nextRun(d("2026-11-09"), "QUARTERLY").toISOString().slice(0, 10)).toBe("2027-02-09");
    expect(nextRun(d("2026-11-09"), "WEEKLY").toISOString().slice(0, 10)).toBe("2026-11-16");
  });
  it("lists every missed date up to now, respecting the end date and a cap", () => {
    const list = dueDates(d("2026-08-31"), "MONTHLY", d("2026-11-09"));
    expect(list.map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-08-31", "2026-09-30", "2026-10-31"]);
    expect(dueDates(d("2026-08-01"), "MONTHLY", d("2026-11-09"), d("2026-09-15")).length).toBe(2);
    expect(dueDates(d("2020-01-01"), "WEEKLY", d("2026-11-09"), null, 12).length).toBe(12);
  });
});

describe("approval decision", () => {
  it("only parks entries from people who cannot approve, at or above the threshold", () => {
    const on = { approvalRequired: true, approvalThreshold: 5000 };
    expect(decideApproval(on, 9000, false)).toBe("PENDING");
    expect(decideApproval(on, 4999, false)).toBe("APPROVED");
    expect(decideApproval(on, 9000, true)).toBe("APPROVED");
    expect(decideApproval({ approvalRequired: false, approvalThreshold: 0 }, 9000, false)).toBe("APPROVED");
  });
});

describe("billableAmount", () => {
  it("bills the cost without claimable credit, plus markup", () => {
    expect(billableAmount({ amount: 11800, creditableGst: 1800, markupPercent: 10 })).toBe(11000);
    expect(billableAmount({ amount: 500, creditableGst: 0, markupPercent: null })).toBe(500);
    expect(billableAmount({ amount: 100, creditableGst: 500, markupPercent: 0 })).toBe(0);
  });
});

describe("inbound mail and scan shaping", () => {
  it("reads Postmark-style and generic attachment lists, capped at five", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const one = attachmentsFromJson({ From: "a@b.c", Subject: "Bill", Attachments: [{ Name: "x.pdf", Content: b64, ContentType: "application/pdf" }] });
    expect(one).toMatchObject({ from: "a@b.c", subject: "Bill" });
    expect(one.attachments).toHaveLength(1);
    const many = attachmentsFromJson({ attachments: Array.from({ length: 9 }, () => ({ name: "r", content: b64 })) });
    expect(many.attachments).toHaveLength(5);
    expect(attachmentsFromJson({ attachments: [{ name: "empty", content: "" }] }).attachments).toHaveLength(0);
  });
  it("accepts a GSTIN only when valid, blocks credit on meals, and falls back to Other", () => {
    const r = shapeScan({ vendor: "Cafe", amount: "1,200", date: "2026-11-01", category: "Meals & Entertainment", gstRate: 5, vendorGstin: "not-a-gstin" });
    expect(r.amount).toBe(1200);
    expect(r.gst).toMatchObject({ itcStatus: "INELIGIBLE", vendorGstin: "" });
    expect(shapeScan({ category: "Made up", amount: "x" })).toMatchObject({ category: "Other", amount: "" });
  });
});
