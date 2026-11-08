import { CA_RULES } from "./rules";
import { fyLabel } from "./fy";

export type EntityType = "PROPRIETOR" | "PARTNERSHIP" | "LLP" | "COMPANY" | "OTHER";
export type TaxRegime = "NEW" | "OLD";
export type Presumptive = "NONE" | "SEC_44ADA" | "SEC_44AD";

export type CaSetup = {
  entityType: EntityType | null;
  taxRegime: TaxRegime | null;
  presumptive: Presumptive;
  taxAuditApplicable: boolean;
  tan: string | null;
};

export type CaFlags = {
  hasEmployees: boolean;
  hasTds: boolean;
  /** First payroll month on record (or this month when payroll has not started): obligations before it never existed for this business. */
  payrollSince?: Date | null;
  /** First tax deduction on record, likewise. */
  tdsSince?: Date | null;
};

export type CaGroup = "GST" | "TDS" | "INCOME_TAX" | "PAYROLL" | "ROC" | "YEAR";
export type CaStatus = "NOT_STARTED" | "IN_PROGRESS" | "READY" | "FILED" | "NOT_APPLICABLE";
export type CaState = "FILED" | "OVERDUE" | "DUE_SOON" | "READY" | "IN_PROGRESS" | "UPCOMING" | "NOT_APPLICABLE";
export type PeriodType = "month" | "quarter" | "year";

export type StoredItem = {
  kind: string;
  periodKey: string;
  status: string;
  ownerUserId: string | null;
  filedAt: Date | null;
  reference: string | null;
  notes: string | null;
  dueOverride: Date | null;
  signedOffByName: string | null;
  signedOffAt: Date | null;
};

/** The GST workspace's own view of a return, so the calendar never tracks GST twice. */
export type GstObligationLike = {
  returnType: string;
  periodKey: string;
  label: string;
  optional: boolean;
  dueDate: string;
  extendedDueDate: string | null;
  status: "FILED" | "OVERDUE" | "DUE_SOON" | "PENDING" | "OPEN_PERIOD";
  reviewStatus: "READY_FOR_REVIEW" | "APPROVED" | null;
  filing: { filedAt: Date | null; arn: string | null } | null;
};

export type CaItemView = {
  id: string;
  kind: string;
  group: CaGroup;
  periodKey: string;
  periodType: PeriodType;
  /** Display label for GST rows (e.g. "GSTR-3B"); other kinds are labelled by `kind` through i18n. */
  label: string | null;
  dueDate: string;
  effectiveDue: string;
  status: CaStatus;
  state: CaState;
  daysToDue: number;
  source: "DERIVED" | "GST";
  /** Advance tax: cumulative share of the year's tax due by this date. */
  cumulativePercent: number | null;
  /** Estimated amount due, when an estimate exists. */
  amount: number | null;
  ownerUserId: string | null;
  filedAt: string | null;
  reference: string | null;
  notes: string | null;
  dueOverride: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
  /** Where the work for this item happens. */
  href: string | null;
  /** GST rows take their status from the GST workspace; only owner, notes and sign-off are edited here. */
  statusLocked: boolean;
};

type Derived = {
  kind: string;
  group: CaGroup;
  periodKey: string;
  periodType: PeriodType;
  due: Date;
  cumulativePercent?: number;
  href: string | null;
  autoNotApplicable?: boolean;
};

const eod = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d, 23, 59, 59, 999));
const pad = (n: number) => String(n).padStart(2, "0");
const DAY = 86400000;

export const daysToDue = (due: Date, now: Date) => Math.ceil((due.getTime() - now.getTime()) / DAY);

export function stateOf(status: CaStatus, due: Date, now: Date): CaState {
  if (status === "FILED") return "FILED";
  if (status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (due.getTime() < now.getTime()) return "OVERDUE";
  if (daysToDue(due, now) <= CA_RULES.dueSoonDays) return "DUE_SOON";
  if (status === "READY") return "READY";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  return "UPCOMING";
}

/** Obligations that depend only on the entity setup and what the business does, before anyone records anything. */
export function deriveObligations(startYear: number, setup: CaSetup, flags: CaFlags, estimatedTax: number | null): Derived[] {
  const out: Derived[] = [];
  const next = startYear + 1;
  const fy = fyLabel(startYear);
  const entity = setup.entityType;
  const audit = setup.taxAuditApplicable || entity === "COMPANY";

  // Advance tax: a single instalment by 15 March for presumptive taxpayers, four otherwise. Not due under ₹10,000.
  if (entity) {
    const presumptive = setup.presumptive !== "NONE";
    const notDue = estimatedTax !== null && estimatedTax < CA_RULES.advanceTaxMinimum;
    CA_RULES.advanceTaxInstalments.forEach((inst, i) => {
      if (presumptive && inst.percent !== 100) return;
      out.push({ kind: "ADVANCE_TAX", group: "INCOME_TAX", periodKey: `${fy}-Q${i + 1}`, periodType: "quarter", due: eod(inst.month <= 2 ? next : startYear, inst.month, inst.day), cumulativePercent: inst.percent, href: "/tax/income-tax", autoNotApplicable: notDue });
    });
  }

  // TDS and payroll: only when the business deducts tax or employs people.
  const deducts = flags.hasTds || flags.hasEmployees || !!setup.tan;
  const ms = (d: Date | null | undefined) => (d ? d.getTime() : Number.NEGATIVE_INFINITY);
  const payrollSince = ms(flags.payrollSince);
  const tdsSince = ms(flags.tdsSince);
  // A deposit or contribution for a month before the business started deducting or paying does not exist; do not list it as overdue.
  const deductSince = flags.hasEmployees && flags.hasTds ? Math.min(payrollSince, tdsSince) : flags.hasEmployees ? payrollSince : tdsSince;
  for (let i = 0; i < 12; i++) {
    const month0 = (3 + i) % 12;
    const year = month0 >= 3 ? startYear : next;
    const key = `${year}-${pad(month0 + 1)}`;
    const monthEnd = Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999);
    const dueYear = month0 === 11 ? year + 1 : year;
    const dueMonth = (month0 + 1) % 12;
    if (deducts && monthEnd >= deductSince) {
      const due = month0 === 2 ? eod(next, CA_RULES.tdsMarchDepositDue.month, CA_RULES.tdsMarchDepositDue.day) : eod(dueYear, dueMonth, CA_RULES.tdsDepositDay);
      out.push({ kind: "TDS_DEPOSIT", group: "TDS", periodKey: key, periodType: "month", due, href: "/expenses" });
    }
    if (flags.hasEmployees && monthEnd >= payrollSince) {
      out.push({ kind: "PF", group: "PAYROLL", periodKey: key, periodType: "month", due: eod(dueYear, dueMonth, CA_RULES.providentFundDay), href: "/payroll" });
      out.push({ kind: "ESI", group: "PAYROLL", periodKey: key, periodType: "month", due: eod(dueYear, dueMonth, CA_RULES.providentFundDay), href: "/payroll" });
    }
  }
  if (deducts) {
    for (const q of CA_RULES.tdsReturnDue) {
      const due = eod(q.nextYear ? next : startYear, q.month, q.day);
      const key = `${fy}-Q${q.quarter}`;
      // Quarter q covers three months of the FY; its last day is three months after the previous quarter's.
      const quarterEnd = Date.UTC(startYear, 3 + q.quarter * 3, 0, 23, 59, 59, 999);
      if (flags.hasEmployees && quarterEnd >= payrollSince) out.push({ kind: "TDS_RETURN_24Q", group: "TDS", periodKey: key, periodType: "quarter", due, href: "/payroll" });
      if ((flags.hasTds || (!flags.hasEmployees && !!setup.tan)) && quarterEnd >= tdsSince) out.push({ kind: "TDS_RETURN_26Q", group: "TDS", periodKey: key, periodType: "quarter", due, href: "/expenses" });
    }
  }
  if (flags.hasEmployees) out.push({ kind: "FORM_16", group: "TDS", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.form16Due.month, CA_RULES.form16Due.day), href: "/payroll" });

  if (entity) {
    const itr = audit ? CA_RULES.itrAudit : CA_RULES.itrNonAudit;
    out.push({ kind: "ITR", group: "INCOME_TAX", periodKey: fy, periodType: "year", due: eod(next, itr.month, itr.day), href: "/tax/income-tax" });
    if (setup.taxAuditApplicable) out.push({ kind: "TAX_AUDIT", group: "INCOME_TAX", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.taxAuditReport.month, CA_RULES.taxAuditReport.day), href: null });
    if (entity === "COMPANY") {
      out.push({ kind: "ROC_AOC4", group: "ROC", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.rocCompany.aoc4.month, CA_RULES.rocCompany.aoc4.day), href: null });
      out.push({ kind: "ROC_MGT7", group: "ROC", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.rocCompany.mgt7.month, CA_RULES.rocCompany.mgt7.day), href: null });
      out.push({ kind: "DIR3_KYC", group: "ROC", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.rocCompany.dir3Kyc.month, CA_RULES.rocCompany.dir3Kyc.day), href: null });
    }
    if (entity === "LLP") {
      out.push({ kind: "ROC_FORM11", group: "ROC", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.rocLlp.form11.month, CA_RULES.rocLlp.form11.day), href: null });
      out.push({ kind: "ROC_FORM8", group: "ROC", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.rocLlp.form8.month, CA_RULES.rocLlp.form8.day), href: null });
    }
  }
  out.push({ kind: "YEAR_CLOSE", group: "YEAR", periodKey: fy, periodType: "year", due: eod(next, CA_RULES.yearCloseTarget.month, CA_RULES.yearCloseTarget.day), href: null });
  return out;
}

const GST_HREF = "/tax";

/** GST period keys: "2026-04" (month), "2026-Q1" (quarter) and "2026-27" (the annual return). */
export function gstPeriodType(key: string): PeriodType {
  if (/^\d{4}-Q[1-4]$/.test(key)) return "quarter";
  const m = /^\d{4}-(\d{2})$/.exec(key);
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? "month" : "year";
}

function toView(args: {
  kind: string; group: CaGroup; periodKey: string; periodType: PeriodType; label: string | null; due: Date; status: CaStatus; source: "DERIVED" | "GST";
  stored: StoredItem | undefined; cumulativePercent: number | null; amount: number | null; href: string | null; statusLocked: boolean; filedAt?: Date | null; reference?: string | null; now: Date;
}): CaItemView {
  const s = args.stored;
  const effective = s?.dueOverride ?? args.due;
  return {
    id: `${args.kind}:${args.periodKey}`,
    kind: args.kind, group: args.group, periodKey: args.periodKey, periodType: args.periodType, label: args.label,
    dueDate: args.due.toISOString(), effectiveDue: effective.toISOString(),
    status: args.status, state: stateOf(args.status, effective, args.now), daysToDue: daysToDue(effective, args.now),
    source: args.source, cumulativePercent: args.cumulativePercent, amount: args.amount,
    ownerUserId: s?.ownerUserId ?? null,
    filedAt: (args.filedAt ?? s?.filedAt)?.toISOString() ?? null,
    reference: args.reference ?? s?.reference ?? null,
    notes: s?.notes ?? null,
    dueOverride: s?.dueOverride?.toISOString() ?? null,
    signedOffBy: s?.signedOffAt ? s.signedOffByName ?? "—" : null,
    signedOffAt: s?.signedOffAt?.toISOString() ?? null,
    href: args.href, statusLocked: args.statusLocked,
  };
}

export function buildCaCalendar(args: { startYear: number; setup: CaSetup; flags: CaFlags; gst: GstObligationLike[]; stored: StoredItem[]; estimatedTax: number | null; now: Date }): CaItemView[] {
  const storedBy = new Map(args.stored.map((s) => [`${s.kind}:${s.periodKey}`, s]));
  const items: CaItemView[] = [];

  for (const d of deriveObligations(args.startYear, args.setup, args.flags, args.estimatedTax)) {
    const stored = storedBy.get(`${d.kind}:${d.periodKey}`);
    let status = (stored?.status as CaStatus | undefined) ?? "NOT_STARTED";
    if (d.autoNotApplicable && !stored) status = "NOT_APPLICABLE";
    const amount = d.kind === "ADVANCE_TAX" && args.estimatedTax !== null && d.cumulativePercent ? Math.round((args.estimatedTax * d.cumulativePercent) / 100) : null;
    items.push(toView({ kind: d.kind, group: d.group, periodKey: d.periodKey, periodType: d.periodType, label: null, due: d.due, status, source: "DERIVED", stored, cumulativePercent: d.cumulativePercent ?? null, amount, href: d.href, statusLocked: false, now: args.now }));
  }

  for (const g of args.gst) {
    if (g.optional) continue;
    const kind = `GST_${g.returnType}`;
    const stored = storedBy.get(`${kind}:${g.periodKey}`);
    const status: CaStatus = g.status === "FILED" ? "FILED" : g.reviewStatus ? "READY" : "NOT_STARTED";
    const due = new Date(g.extendedDueDate ?? g.dueDate);
    const periodType = gstPeriodType(g.periodKey);
    items.push(toView({ kind, group: "GST", periodKey: g.periodKey, periodType, label: g.label, due, status, source: "GST", stored: stored ? { ...stored, dueOverride: null } : undefined, cumulativePercent: null, amount: null, href: `${GST_HREF}?period=${encodeURIComponent(g.periodKey)}`, statusLocked: true, filedAt: g.filing?.filedAt ?? null, reference: g.filing?.arn ?? null, now: args.now }));
  }

  return items.sort((a, b) => a.effectiveDue.localeCompare(b.effectiveDue) || a.kind.localeCompare(b.kind));
}

export type CaProgress = { total: number; filed: number; overdue: number; dueSoon: number; signedOff: number; next: CaItemView | null; percent: number };

export function calendarProgress(items: CaItemView[]): CaProgress {
  const live = items.filter((i) => i.state !== "NOT_APPLICABLE" && i.kind !== "YEAR_CLOSE");
  const filed = live.filter((i) => i.state === "FILED").length;
  const next = live.filter((i) => i.state !== "FILED").sort((a, b) => a.effectiveDue.localeCompare(b.effectiveDue))[0] ?? null;
  return {
    total: live.length,
    filed,
    overdue: live.filter((i) => i.state === "OVERDUE").length,
    dueSoon: live.filter((i) => i.state === "DUE_SOON").length,
    signedOff: live.filter((i) => i.signedOffAt).length,
    next,
    percent: live.length ? Math.round((filed / live.length) * 100) : 0,
  };
}
