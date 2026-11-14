/**
 * Pre-flight checks and month-on-month variance for a payroll run. Pure: everything it needs is passed in,
 * so the rules are easy to test and the same findings can be shown before and after a run is generated.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export type PayrollIssue = {
  code: string;
  severity: IssueSeverity;
  employeeId?: string;
  name?: string;
  params?: Record<string, string | number>;
};

export type CheckEmployee = {
  id: string;
  name: string;
  hasCompensation: boolean;
  paymentMode: string;
  hasBank: boolean;
  /** ifsc + last four of the account, to spot two people sharing one account. */
  bankKey: string | null;
  hasPan: boolean;
  hasUan: boolean;
  pfEnabled: boolean;
  esiEnabled: boolean;
  hasEsiNumber: boolean;
  ptState: string | null;
  joinsThisPeriod: boolean;
  leavesThisPeriod: boolean;
  onLeaveStatus: boolean;
  pendingLeaveRequests: number;
  missingAttendanceDays: number;
  ytdAssumed: boolean;
  lopDays: number;
  /** Set once calculated. */
  netPay?: number;
  gross?: number;
  warnings?: string[];
};

export function runChecks(args: { employees: CheckEmployee[]; workforceLinked: boolean; periodInPast: boolean }): PayrollIssue[] {
  const out: PayrollIssue[] = [];
  const add = (code: string, severity: IssueSeverity, e?: CheckEmployee, params?: PayrollIssue['params']) =>
    out.push({ code, severity, ...(e ? { employeeId: e.id, name: e.name } : {}), ...(params ? { params } : {}) });

  if (args.employees.length === 0) add('NO_EMPLOYEES', 'error');

  const byBank = new Map<string, CheckEmployee[]>();
  for (const e of args.employees) {
    if (!e.hasCompensation) {
      add('NO_COMPENSATION', 'error', e);
      continue;
    }
    if (e.paymentMode === 'BANK_TRANSFER' && !e.hasBank) add('NO_BANK', 'warning', e);
    if (!e.hasPan) add('NO_PAN', 'warning', e);
    if (e.pfEnabled && !e.hasUan) add('NO_UAN', 'warning', e);
    if (e.esiEnabled && !e.hasEsiNumber) add('NO_ESI_NUMBER', 'warning', e);
    if (!e.ptState) add('NO_PT_STATE', 'info', e);
    if (e.joinsThisPeriod) add('JOINER', 'info', e);
    if (e.leavesThisPeriod) add('LEAVER', 'info', e);
    if (e.onLeaveStatus) add('ON_LEAVE_STATUS', 'info', e);
    if (e.ytdAssumed) add('YTD_ASSUMED', 'info', e);
    if (e.pendingLeaveRequests > 0) add('PENDING_LEAVE', 'warning', e, { count: e.pendingLeaveRequests });
    if (args.workforceLinked && e.missingAttendanceDays > 0 && args.periodInPast) add('MISSING_ATTENDANCE', 'info', e, { days: e.missingAttendanceDays });
    if (e.bankKey) byBank.set(e.bankKey, [...(byBank.get(e.bankKey) ?? []), e]);
    if (e.netPay !== undefined && e.netPay <= 0 && (e.gross ?? 0) > 0) add('ZERO_NET', 'error', e);
    for (const w of e.warnings ?? []) {
      if (['PT_STATE_NOT_MODELLED', 'DEDUCTIONS_CAPPED', 'NEGATIVE_NET', 'LOP_EXCEEDS_DAYS', 'ESI_ABOVE_LIMIT'].includes(w)) add(w, w === 'NEGATIVE_NET' ? 'error' : 'warning', e);
    }
  }
  for (const group of byBank.values()) {
    if (group.length > 1) for (const e of group) add('DUPLICATE_BANK', 'warning', e, { with: group.filter((g) => g.id !== e.id).map((g) => g.name).join(', ') });
  }
  return out;
}

export type PreviousLine = { employeeId: string; name: string; netPay: number; gross: number };
export type CurrentLine = { employeeId: string; name: string; netPay: number; gross: number };

export type VarianceFlag = {
  employeeId: string;
  name: string;
  kind: 'NEW' | 'GONE' | 'CHANGED';
  previous: number;
  current: number;
  delta: number;
  pct: number | null;
};

/** People whose pay moved by a quarter or more (and at least 1,000), plus anyone new or missing since the last run. */
export function computeVariance(previous: PreviousLine[], current: CurrentLine[], opts = { pct: 25, minAmount: 1000 }): VarianceFlag[] {
  const prev = new Map(previous.map((p) => [p.employeeId, p]));
  const cur = new Map(current.map((c) => [c.employeeId, c]));
  const flags: VarianceFlag[] = [];
  for (const c of current) {
    const p = prev.get(c.employeeId);
    if (!p) {
      flags.push({ employeeId: c.employeeId, name: c.name, kind: 'NEW', previous: 0, current: c.netPay, delta: c.netPay, pct: null });
      continue;
    }
    const delta = Math.round((c.netPay - p.netPay) * 100) / 100;
    const pct = p.netPay > 0 ? Math.round((delta / p.netPay) * 1000) / 10 : null;
    if (Math.abs(delta) >= opts.minAmount && (pct === null || Math.abs(pct) >= opts.pct)) {
      flags.push({ employeeId: c.employeeId, name: c.name, kind: 'CHANGED', previous: p.netPay, current: c.netPay, delta, pct });
    }
  }
  for (const p of previous) {
    if (!cur.has(p.employeeId)) flags.push({ employeeId: p.employeeId, name: p.name, kind: 'GONE', previous: p.netPay, current: 0, delta: -p.netPay, pct: -100 });
  }
  return flags.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
