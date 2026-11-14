/**
 * Pure workforce report calculations (no database, no server-only imports) so
 * they can be unit tested. The query layer in `lib/workforce/reports.ts` feeds
 * them rows scoped to a single workspace.
 */

export type ReportEmployee = {
  id: string;
  joinDate: Date | null;
  exitDate: Date | null;
  createdAt: Date;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  departmentName: string | null;
};

export type ReportAttendance = {
  employeeId: string;
  date: Date;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY' | 'HOLIDAY' | 'REMOTE';
};

export type ReportLeave = {
  startDate: Date;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
};

export type MonthKey = string; // YYYY-MM (UTC)

export type WorkforceReport = {
  period: { from: string; to: string; months: MonthKey[] };
  headcount: {
    current: number;
    series: Array<{ month: MonthKey; headcount: number; joiners: number; leavers: number }>;
    byDepartment: Array<{ department: string; count: number }>;
  };
  attendance: {
    totals: Record<ReportAttendance['status'], number>;
    recordsCounted: number;
    /** Share of working-day records where the person was present in some form; null when no data. */
    attendanceRate: number | null;
    /** Share of present-type records that were late; null when no data. */
    lateRate: number | null;
    series: Array<{ month: MonthKey; attendanceRate: number | null; records: number }>;
  };
  leave: {
    byType: Array<{ leaveTypeId: string; name: string; code: string; approvedDays: number; requests: number }>;
    statusCounts: Record<ReportLeave['status'], number>;
    totalApprovedDays: number;
  };
};

export const MAX_REPORT_MONTHS = 24;

export function monthKey(d: Date): MonthKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive list of UTC month keys covering [from, to]. Capped at MAX_REPORT_MONTHS. */
export function monthsBetween(from: Date, to: Date): MonthKey[] {
  if (to < from) return [];
  const months: MonthKey[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();
  while ((y < endY || (y === endY && m <= endM)) && months.length < MAX_REPORT_MONTHS) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

function monthEndExclusive(key: MonthKey): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1));
}

function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

const PRESENT_WEIGHT: Record<ReportAttendance['status'], number> = {
  PRESENT: 1,
  LATE: 1,
  REMOTE: 1,
  HALF_DAY: 0.5,
  ABSENT: 0,
  HOLIDAY: 0, // excluded from the denominator
};

function attendanceRate(rows: ReportAttendance[]): number | null {
  let present = 0;
  let working = 0;
  for (const r of rows) {
    if (r.status === 'HOLIDAY') continue;
    working += 1;
    present += PRESENT_WEIGHT[r.status];
  }
  return working === 0 ? null : round(present / working);
}

function employeeStart(e: ReportEmployee): Date {
  return e.joinDate ?? e.createdAt;
}

export function buildWorkforceReport(input: {
  from: Date;
  to: Date;
  employees: ReportEmployee[];
  attendance: ReportAttendance[];
  leave: ReportLeave[];
}): WorkforceReport {
  const months = monthsBetween(input.from, input.to);

  const series = months.map((month) => {
    const end = monthEndExclusive(month);
    const start = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1));
    let headcount = 0;
    let joiners = 0;
    let leavers = 0;
    for (const e of input.employees) {
      const s = employeeStart(e);
      if (s < end && (!e.exitDate || e.exitDate >= end)) headcount += 1;
      if (s >= start && s < end) joiners += 1;
      if (e.exitDate && e.exitDate >= start && e.exitDate < end) leavers += 1;
    }
    return { month, headcount, joiners, leavers };
  });

  const deptCounts = new Map<string, number>();
  let current = 0;
  for (const e of input.employees) {
    if (e.status === 'INACTIVE') continue;
    current += 1;
    const name = e.departmentName ?? 'Unassigned';
    deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
  }
  const byDepartment = [...deptCounts.entries()]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department));

  const totals: WorkforceReport['attendance']['totals'] = {
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    HALF_DAY: 0,
    HOLIDAY: 0,
    REMOTE: 0,
  };
  const byMonth = new Map<MonthKey, ReportAttendance[]>();
  for (const r of input.attendance) {
    totals[r.status] += 1;
    const key = monthKey(r.date);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(r);
    else byMonth.set(key, [r]);
  }
  const presentTypes = totals.PRESENT + totals.LATE + totals.REMOTE + totals.HALF_DAY;

  const leaveTypeMap = new Map<string, WorkforceReport['leave']['byType'][number]>();
  const statusCounts: WorkforceReport['leave']['statusCounts'] = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };
  let totalApprovedDays = 0;
  for (const l of input.leave) {
    statusCounts[l.status] += 1;
    if (l.status !== 'APPROVED') continue;
    totalApprovedDays += l.days;
    const row = leaveTypeMap.get(l.leaveTypeId) ?? {
      leaveTypeId: l.leaveTypeId,
      name: l.leaveTypeName,
      code: l.leaveTypeCode,
      approvedDays: 0,
      requests: 0,
    };
    row.approvedDays = round(row.approvedDays + l.days, 2);
    row.requests += 1;
    leaveTypeMap.set(l.leaveTypeId, row);
  }

  return {
    period: { from: input.from.toISOString(), to: input.to.toISOString(), months },
    headcount: { current, series, byDepartment },
    attendance: {
      totals,
      recordsCounted: input.attendance.length,
      attendanceRate: attendanceRate(input.attendance),
      lateRate: presentTypes === 0 ? null : round(totals.LATE / presentTypes),
      series: months.map((month) => {
        const rows = byMonth.get(month) ?? [];
        return { month, attendanceRate: attendanceRate(rows), records: rows.length };
      }),
    },
    leave: {
      byType: [...leaveTypeMap.values()].sort((a, b) => b.approvedDays - a.approvedDays || a.name.localeCompare(b.name)),
      statusCounts,
      totalApprovedDays: round(totalApprovedDays, 2),
    },
  };
}

/** Parses ?from=&to= (YYYY-MM-DD). Defaults to the trailing 6 months; clamps to MAX_REPORT_MONTHS. */
export function resolveReportRange(
  fromParam: string | null,
  toParam: string | null,
  now: Date = new Date(),
): { from: Date; to: Date } | { error: string } {
  const parse = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null);
  const to = toParam ? parse(toParam) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!to || Number.isNaN(to.getTime())) return { error: 'Invalid "to" date; expected YYYY-MM-DD' };
  const from = fromParam ? parse(fromParam) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1));
  if (!from || Number.isNaN(from.getTime())) return { error: 'Invalid "from" date; expected YYYY-MM-DD' };
  if (from > to) return { error: '"from" must not be after "to"' };
  const limit = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + MAX_REPORT_MONTHS, 1));
  if (to >= limit) return { error: `Range is limited to ${MAX_REPORT_MONTHS} months` };
  return { from, to };
}
