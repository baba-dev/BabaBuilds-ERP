import { describe, expect, it } from "vitest";
import { fyOptions, monthsElapsedInFy, parseAnyFy } from "@/lib/ca/fy";
import { buildCaCalendar, calendarProgress, deriveObligations, gstPeriodType, stateOf, type CaSetup, type GstObligationLike } from "@/lib/ca/calendar";
import { gstRegistrationHint, presumptiveView } from "@/lib/ca/presumptive";
import { blockedKinds, buildReadiness, type ReadinessCounts } from "@/lib/ca/readiness";
import { estimateYearTax, EMPTY_FIGURES } from "@/lib/ca/summary";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const day = (iso: string) => iso.slice(0, 10);

const setup = (over: Partial<CaSetup> = {}): CaSetup => ({ entityType: "PROPRIETOR", taxRegime: "NEW", presumptive: "NONE", taxAuditApplicable: false, tan: null, ...over });
const none = { hasEmployees: false, hasTds: false };

describe("financial years", () => {
  it("offers the current year (Nov 2026 is FY 2026-27) back to the earliest data", () => {
    const opts = fyOptions(D("2026-11-08"), D("2023-06-01"));
    expect(opts[0]).toEqual({ start: 2026, label: "2026-27" });
    expect(opts.at(-1)?.label).toBe("2023-24");
    expect(fyOptions(D("2026-11-08"), null).map((o) => o.label)).toEqual(["2026-27", "2025-26", "2024-25"]);
  });
  it("accepts canonical and legacy labels", () => {
    expect(parseAnyFy("2026-27")).toBe(2026);
    expect(parseAnyFy("26-27")).toBe(2026);
    expect(parseAnyFy("2026-28")).toBeNull();
    expect(parseAnyFy(null)).toBeNull();
  });
  it("counts finished months", () => {
    expect(monthsElapsedInFy(2026, D("2026-03-01"))).toBe(0);
    expect(monthsElapsedInFy(2026, D("2026-04-15"))).toBe(0);
    expect(monthsElapsedInFy(2026, D("2026-11-08"))).toBe(7);
    expect(monthsElapsedInFy(2026, D("2027-05-01"))).toBe(12);
  });
});

describe("calendar rules", () => {
  it("gives a proprietor four advance-tax instalments and a July ITR", () => {
    const d = deriveObligations(2026, setup(), none, null);
    const adv = d.filter((x) => x.kind === "ADVANCE_TAX");
    expect(adv.map((x) => [day(x.due.toISOString()), x.cumulativePercent])).toEqual([["2026-06-15", 15], ["2026-09-15", 45], ["2026-12-15", 75], ["2027-03-15", 100]]);
    expect(day(d.find((x) => x.kind === "ITR")!.due.toISOString())).toBe("2027-07-31");
    expect(d.some((x) => x.kind.startsWith("TDS") || x.kind === "PF")).toBe(false);
  });
  it("gives presumptive taxpayers a single March instalment", () => {
    const adv = deriveObligations(2026, setup({ presumptive: "SEC_44ADA" }), none, null).filter((x) => x.kind === "ADVANCE_TAX");
    expect(adv).toHaveLength(1);
    expect(day(adv[0].due.toISOString())).toBe("2027-03-15");
  });
  it("moves the ITR to 31 October with a tax audit or for a company, and adds the audit report", () => {
    const audited = deriveObligations(2026, setup({ taxAuditApplicable: true }), none, null);
    expect(day(audited.find((x) => x.kind === "ITR")!.due.toISOString())).toBe("2027-10-31");
    expect(day(audited.find((x) => x.kind === "TAX_AUDIT")!.due.toISOString())).toBe("2027-09-30");
    const company = deriveObligations(2026, setup({ entityType: "COMPANY" }), none, null);
    expect(day(company.find((x) => x.kind === "ITR")!.due.toISOString())).toBe("2027-10-31");
    expect(company.map((x) => x.kind)).toEqual(expect.arrayContaining(["ROC_AOC4", "ROC_MGT7", "DIR3_KYC"]));
    expect(company.some((x) => x.kind === "ROC_FORM11")).toBe(false);
  });
  it("gives an LLP its two annual forms", () => {
    const llp = deriveObligations(2026, setup({ entityType: "LLP" }), none, null);
    expect(llp.map((x) => x.kind)).toEqual(expect.arrayContaining(["ROC_FORM11", "ROC_FORM8"]));
  });
  it("schedules TDS deposits on the 7th and March's on 30 April, and PF/ESI on the 15th", () => {
    const d = deriveObligations(2026, setup(), { hasEmployees: true, hasTds: true }, null);
    const dep = d.filter((x) => x.kind === "TDS_DEPOSIT");
    expect(dep).toHaveLength(12);
    expect(day(dep.find((x) => x.periodKey === "2026-04")!.due.toISOString())).toBe("2026-05-07");
    expect(day(dep.find((x) => x.periodKey === "2026-12")!.due.toISOString())).toBe("2027-01-07");
    expect(day(dep.find((x) => x.periodKey === "2027-03")!.due.toISOString())).toBe("2027-04-30");
    const pf = d.filter((x) => x.kind === "PF");
    expect(day(pf.find((x) => x.periodKey === "2027-03")!.due.toISOString())).toBe("2027-04-15");
    expect(d.filter((x) => x.kind === "TDS_RETURN_24Q").map((x) => day(x.due.toISOString()))).toEqual(["2026-07-31", "2026-10-31", "2027-01-31", "2027-05-31"]);
    expect(d.some((x) => x.kind === "FORM_16")).toBe(true);
  });
  it("does not invent obligations for months before payroll or deductions began", () => {
    const d = deriveObligations(2026, setup(), { hasEmployees: true, hasTds: false, payrollSince: D("2026-10-01"), tdsSince: D("2026-10-01") }, null);
    expect(d.filter((x) => x.kind === "PF").map((x) => x.periodKey)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
    expect(d.filter((x) => x.kind === "TDS_RETURN_24Q").map((x) => x.periodKey)).toEqual(["2026-27-Q3", "2026-27-Q4"]);
    const none = deriveObligations(2026, setup(), { hasEmployees: false, hasTds: true, tdsSince: D("2027-01-01") }, null);
    expect(none.filter((x) => x.kind === "TDS_DEPOSIT").map((x) => x.periodKey)).toEqual(["2027-01", "2027-02", "2027-03"]);
  });
  it("only files 26Q for a deductor without employees", () => {
    const d = deriveObligations(2026, setup(), { hasEmployees: false, hasTds: true }, null);
    expect(d.some((x) => x.kind === "TDS_RETURN_26Q")).toBe(true);
    expect(d.some((x) => x.kind === "TDS_RETURN_24Q")).toBe(false);
  });
  it("shows nothing income-tax related until the entity is known", () => {
    const d = deriveObligations(2026, setup({ entityType: null }), none, null);
    expect(d.map((x) => x.kind)).toEqual(["YEAR_CLOSE"]);
  });
});

describe("calendar states", () => {
  const now = D("2026-11-08");
  it("derives overdue, due-soon, ready and filed", () => {
    const due = (s: string) => new Date(`${s}T23:59:59.999Z`);
    expect(stateOf("NOT_STARTED", due("2026-10-01"), now)).toBe("OVERDUE");
    expect(stateOf("NOT_STARTED", due("2026-11-15"), now)).toBe("DUE_SOON");
    expect(stateOf("READY", due("2027-01-15"), now)).toBe("READY");
    expect(stateOf("IN_PROGRESS", due("2027-01-15"), now)).toBe("IN_PROGRESS");
    expect(stateOf("NOT_STARTED", due("2027-01-15"), now)).toBe("UPCOMING");
    expect(stateOf("FILED", due("2026-10-01"), now)).toBe("FILED");
    expect(stateOf("NOT_APPLICABLE", due("2026-10-01"), now)).toBe("NOT_APPLICABLE");
  });
  it("marks advance tax not applicable below ₹10,000 and prices the instalments otherwise", () => {
    const small = buildCaCalendar({ startYear: 2026, setup: setup(), flags: none, gst: [], stored: [], estimatedTax: 5000, now });
    expect(small.filter((i) => i.kind === "ADVANCE_TAX").every((i) => i.state === "NOT_APPLICABLE")).toBe(true);
    const big = buildCaCalendar({ startYear: 2026, setup: setup(), flags: none, gst: [], stored: [], estimatedTax: 200000, now });
    expect(big.filter((i) => i.kind === "ADVANCE_TAX").map((i) => i.amount)).toEqual([30000, 90000, 150000, 200000]);
  });
  it("applies stored status, extension and sign-off", () => {
    const items = buildCaCalendar({
      startYear: 2026, setup: setup(), flags: none, gst: [], estimatedTax: null, now,
      stored: [{ kind: "ITR", periodKey: "2026-27", status: "FILED", ownerUserId: "u1", filedAt: D("2027-07-20"), reference: "ACK123", notes: "n", dueOverride: D("2027-08-31"), signedOffByName: "Ca Sharma", signedOffAt: D("2027-07-21") }],
    });
    const itr = items.find((i) => i.kind === "ITR")!;
    expect(itr.state).toBe("FILED");
    expect(itr.reference).toBe("ACK123");
    expect(day(itr.effectiveDue)).toBe("2027-08-31");
    expect(itr.signedOffBy).toBe("Ca Sharma");
  });
  it("takes GST status from the GST workspace and skips optional returns", () => {
    const gst: GstObligationLike[] = [
      { returnType: "GSTR3B", periodKey: "2026-09", label: "GSTR-3B", optional: false, dueDate: "2026-10-20T23:59:59.999Z", extendedDueDate: null, status: "OVERDUE", reviewStatus: null, filing: null },
      { returnType: "GSTR1", periodKey: "2026-09", label: "GSTR-1", optional: false, dueDate: "2026-10-11T23:59:59.999Z", extendedDueDate: null, status: "FILED", reviewStatus: null, filing: { filedAt: D("2026-10-10"), arn: "AA123" } },
      { returnType: "PMT06", periodKey: "2026-09", label: "PMT-06", optional: true, dueDate: "2026-10-25T23:59:59.999Z", extendedDueDate: null, status: "PENDING", reviewStatus: null, filing: null },
    ];
    const items = buildCaCalendar({ startYear: 2026, setup: setup({ entityType: null }), flags: none, gst, stored: [], estimatedTax: null, now });
    const g = items.filter((i) => i.group === "GST");
    expect(g).toHaveLength(2);
    expect(g.find((i) => i.kind === "GST_GSTR3B")!.state).toBe("OVERDUE");
    expect(g.find((i) => i.kind === "GST_GSTR1")).toMatchObject({ state: "FILED", reference: "AA123", statusLocked: true });
  });
  it("tells GST period types apart, including the annual return", () => {
    expect(gstPeriodType("2026-04")).toBe("month");
    expect(gstPeriodType("2026-Q2")).toBe("quarter");
    expect(gstPeriodType("2026-27")).toBe("year");
  });
  it("summarises progress without counting the internal year-close target", () => {
    const items = buildCaCalendar({ startYear: 2025, setup: setup(), flags: none, gst: [], estimatedTax: 100000, now, stored: [{ kind: "ADVANCE_TAX", periodKey: "2025-26-Q1", status: "FILED", ownerUserId: null, filedAt: null, reference: null, notes: null, dueOverride: null, signedOffByName: null, signedOffAt: null }] });
    const p = calendarProgress(items);
    expect(p.total).toBe(items.filter((i) => i.kind !== "YEAR_CLOSE").length);
    expect(p.filed).toBe(1);
    expect(p.overdue).toBeGreaterThan(0);
    expect(p.next).not.toBeNull();
  });
});

describe("presumptive and registration hints", () => {
  it("tests receipts against 44ADA and 44AD limits", () => {
    const v = presumptiveView("PROPRIETOR", 4000000);
    expect(v.ada).toMatchObject({ entityEligible: true, status: "WITHIN", deemedIncome: 2000000 });
    expect(v.ad.deemedIncomeDigital).toBe(240000);
    expect(v.taxAudit).toBe("UNLIKELY");
    expect(presumptiveView("PROPRIETOR", 6000000).ada.status).toBe("WITHIN_IF_LOW_CASH");
    expect(presumptiveView("PROPRIETOR", 9000000).ada.status).toBe("ABOVE");
    expect(presumptiveView("PROPRIETOR", 6000000).taxAudit).toBe("CHECK");
    expect(presumptiveView("PROPRIETOR", 12000000).taxAudit).toBe("LIKELY");
  });
  it("does not offer presumptive schemes to a company or LLP", () => {
    expect(presumptiveView("COMPANY", 1000000).ada.entityEligible).toBe(false);
    expect(presumptiveView("LLP", 1000000).ad.entityEligible).toBe(false);
  });
  it("compares turnover with the GST registration threshold using the real registration", () => {
    expect(gstRegistrationHint({ registered: true, countryIsIndia: true, turnover: 5000000 })).toBe("REGISTERED");
    expect(gstRegistrationHint({ registered: false, countryIsIndia: true, turnover: 2500000 })).toBe("REGISTRATION_MAY_BE_REQUIRED");
    expect(gstRegistrationHint({ registered: false, countryIsIndia: true, turnover: 1000000 })).toBe("BELOW_THRESHOLD");
    expect(gstRegistrationHint({ registered: false, countryIsIndia: false, turnover: 9000000 })).toBe("NOT_APPLICABLE");
  });
});

describe("readiness", () => {
  const counts = (over: Partial<ReadinessCounts> = {}): ReadinessCounts => ({
    sales: { total: 10, missingSac: 0, stateAssumed: 0, gstinInvalid: 0, taxMismatch: 0, missingEvidence: 0 },
    purchases: { total: 5, noReceipt: 0, itcMissingVendor: 0 },
    bank: { total: 20, unreconciled: 0 },
    receivables: { overdueCount: 0, overdueAmount: 0 },
    tds: { undepositedCount: 0, undepositedAmount: 0 },
    payroll: { employees: 0, monthsExpected: 0, monthsClosed: 0 },
    gst: { applicable: true, overdueReturns: 0 },
    ...over,
  });
  it("is ready when nothing is wrong, and payroll is not applicable without employees", () => {
    const r = buildReadiness(counts());
    expect(r.readyToClose).toBe(true);
    expect(r.areas.find((a) => a.key === "payroll")!.status).toBe("NOT_APPLICABLE");
    expect(r.areas.filter((a) => a.status === "OK").length).toBeGreaterThan(3);
  });
  it("blocks on a missing SAC when registered, but only warns for an unregistered business", () => {
    const reg = buildReadiness(counts({ sales: { total: 10, missingSac: 2, stateAssumed: 0, gstinInvalid: 0, taxMismatch: 0, missingEvidence: 0 } }));
    expect(reg.areas.find((a) => a.key === "sales")!.status).toBe("BLOCKED");
    expect(blockedKinds(reg).get("GST_GSTR1")).toContain("SAC_MISSING");
    const unreg = buildReadiness(counts({ gst: { applicable: false, overdueReturns: 0 }, sales: { total: 10, missingSac: 2, stateAssumed: 3, gstinInvalid: 0, taxMismatch: 0, missingEvidence: 0 } }));
    expect(unreg.areas.find((a) => a.key === "sales")!.status).toBe("ATTENTION");
    expect(unreg.areas.find((a) => a.key === "gst")!.status).toBe("NOT_APPLICABLE");
    expect(unreg.readyToClose).toBe(true);
  });
  it("does not let overdue receivables or missing receipts block the close", () => {
    const r = buildReadiness(counts({ receivables: { overdueCount: 4, overdueAmount: 90000 }, purchases: { total: 5, noReceipt: 3, itcMissingVendor: 0 } }));
    expect(r.readyToClose).toBe(true);
    expect(r.areas.find((a) => a.key === "receivables")!.issues[0]).toMatchObject({ severity: "info", amount: 90000 });
  });
  it("blocks on unreconciled bank lines, undeposited TDS and unclosed payroll months", () => {
    const r = buildReadiness(counts({ bank: { total: 20, unreconciled: 4 }, tds: { undepositedCount: 1, undepositedAmount: 5000 }, payroll: { employees: 3, monthsExpected: 7, monthsClosed: 5 } }));
    expect(r.readyToClose).toBe(false);
    expect(r.blockers).toBe(3);
    expect(blockedKinds(r).get("TDS_DEPOSIT")).toContain("TDS_UNDEPOSITED");
    expect(blockedKinds(r).get("TDS_RETURN_24Q")).toEqual(expect.arrayContaining(["PAYROLL_MONTHS_OPEN"]));
  });
});

describe("year tax estimate", () => {
  const figures = { ...EMPTY_FIGURES, billed: 3000000, expenses: 500000, tdsCredits: 100000 };
  it("estimates from books profit and nets TDS credits", () => {
    const e = estimateYearTax({ startYear: 2026, setup: setup(), figures, presumptiveIncome: null })!;
    expect(e.basis).toBe("BOOKS");
    expect(e.taxableIncome).toBe(2500000);
    expect(e.tax).toBeGreaterThan(300000);
    expect(e.payable).toBe(e.tax - 100000);
  });
  it("uses deemed income under a presumptive scheme", () => {
    const e = estimateYearTax({ startYear: 2026, setup: setup({ presumptive: "SEC_44ADA" }), figures, presumptiveIncome: 1500000 })!;
    expect(e.basis).toBe("PRESUMPTIVE");
    expect(e.taxableIncome).toBe(1500000);
  });
  it("uses company rates and returns nothing without an entity", () => {
    const c = estimateYearTax({ startYear: 2026, setup: setup({ entityType: "COMPANY" }), figures, presumptiveIncome: null })!;
    expect(c.tax).toBe(Math.round(2500000 * 0.22 * 1.1 * 1.04));
    expect(estimateYearTax({ startYear: 2026, setup: setup({ entityType: null }), figures, presumptiveIncome: null })).toBeNull();
  });
});
