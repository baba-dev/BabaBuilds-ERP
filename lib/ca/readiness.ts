export type ReadinessCounts = {
  sales: { total: number; missingSac: number; stateAssumed: number; gstinInvalid: number; taxMismatch: number; missingEvidence: number };
  purchases: { total: number; noReceipt: number; itcMissingVendor: number };
  bank: { total: number; unreconciled: number };
  receivables: { overdueCount: number; overdueAmount: number };
  tds: { undepositedCount: number; undepositedAmount: number };
  payroll: { employees: number; monthsExpected: number; monthsClosed: number };
  gst: { applicable: boolean; overdueReturns: number };
};

export type IssueSeverity = "blocker" | "warning" | "info";

export type ReadinessIssue = {
  code: string;
  severity: IssueSeverity;
  count: number;
  amount?: number;
  /** Obligation kinds this holds up. */
  blocks: string[];
  href: string;
};

export type ReadinessArea = {
  key: "sales" | "purchases" | "bank" | "gst" | "tds" | "payroll" | "receivables";
  status: "OK" | "ATTENTION" | "BLOCKED" | "NOT_APPLICABLE";
  /** How many records the checks looked at. */
  total: number;
  issues: ReadinessIssue[];
};

export type Readiness = {
  areas: ReadinessArea[];
  blockers: number;
  warnings: number;
  /** True when nothing stops the books being closed for the year. Warnings do not. */
  readyToClose: boolean;
};

const issue = (code: string, severity: IssueSeverity, count: number, blocks: string[], href: string, amount?: number): ReadinessIssue | null =>
  count > 0 ? { code, severity, count, blocks, href, ...(amount !== undefined ? { amount } : {}) } : null;

const area = (key: ReadinessArea["key"], total: number, issues: Array<ReadinessIssue | null>, notApplicable = false): ReadinessArea => {
  const list = issues.filter((i): i is ReadinessIssue => i !== null);
  const status = notApplicable ? "NOT_APPLICABLE" : list.some((i) => i.severity === "blocker") ? "BLOCKED" : list.some((i) => i.severity === "warning") ? "ATTENTION" : "OK";
  return { key, status, total, issues: notApplicable ? [] : list };
};

/** Turns raw counts into per-area readiness. No blended percentage: each area says what it holds up and where to fix it. */
export function buildReadiness(c: ReadinessCounts): Readiness {
  const gst = c.gst.applicable;
  const areas: ReadinessArea[] = [
    area("sales", c.sales.total, [
      issue("SAC_MISSING", gst ? "blocker" : "warning", c.sales.missingSac, ["GST_GSTR1"], "/tax?tab=issues"),
      issue("GSTIN_INVALID", gst ? "blocker" : "warning", c.sales.gstinInvalid, ["GST_GSTR1"], "/tax?tab=issues"),
      issue("STATE_ASSUMED", "warning", gst ? c.sales.stateAssumed : 0, ["GST_GSTR1"], "/tax?tab=issues"),
      issue("TAX_MISMATCH", "warning", c.sales.taxMismatch, ["GST_GSTR1", "GST_GSTR3B"], "/tax?tab=issues"),
      issue("EVIDENCE_MISSING", "warning", c.sales.missingEvidence, ["YEAR_CLOSE"], "/income"),
    ]),
    area("purchases", c.purchases.total, [
      issue("ITC_VENDOR_MISSING", "blocker", gst ? c.purchases.itcMissingVendor : 0, ["GST_GSTR3B"], "/expenses"),
      issue("RECEIPT_MISSING", "warning", c.purchases.noReceipt, ["YEAR_CLOSE"], "/expenses"),
    ]),
    area("bank", c.bank.total, [issue("BANK_UNRECONCILED", "blocker", c.bank.unreconciled, ["YEAR_CLOSE"], "/reconciliation")]),
    area("gst", 0, [issue("GST_RETURN_OVERDUE", "blocker", c.gst.overdueReturns, ["GST_GSTR3B", "GST_GSTR1"], "/tax")], !gst),
    area("tds", 0, [issue("TDS_UNDEPOSITED", "blocker", c.tds.undepositedCount, ["TDS_DEPOSIT", "TDS_RETURN_26Q", "TDS_RETURN_24Q"], "/expenses", c.tds.undepositedAmount)]),
    area("payroll", c.payroll.monthsExpected, [issue("PAYROLL_MONTHS_OPEN", "blocker", Math.max(0, c.payroll.monthsExpected - c.payroll.monthsClosed), ["TDS_RETURN_24Q", "PF", "ESI", "FORM_16"], "/payroll")], c.payroll.employees === 0),
    area("receivables", c.receivables.overdueCount, [issue("RECEIVABLES_OVERDUE", "info", c.receivables.overdueCount, [], "/ar-collections", c.receivables.overdueAmount)]),
  ];
  const all = areas.flatMap((a) => a.issues);
  const blockers = all.filter((i) => i.severity === "blocker").length;
  const warnings = all.filter((i) => i.severity === "warning").length;
  return { areas, blockers, warnings, readyToClose: blockers === 0 };
}

/** Obligation kinds currently held up by a blocker, with the issue codes responsible. */
export function blockedKinds(r: Readiness): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const a of r.areas) for (const i of a.issues) if (i.severity === "blocker") for (const k of i.blocks) out.set(k, [...(out.get(k) ?? []), i.code]);
  return out;
}
