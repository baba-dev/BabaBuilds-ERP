import { describe, expect, it } from 'vitest';
import {
  buildWorkforceReport,
  monthsBetween,
  resolveReportRange,
  type ReportAttendance,
  type ReportEmployee,
  type ReportLeave,
} from '@/lib/workforce/report-math';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const emp = (id: string, join: string | null, exit: string | null, dept: string | null, status: ReportEmployee['status'] = 'ACTIVE'): ReportEmployee => ({
  id,
  joinDate: join ? d(join) : null,
  exitDate: exit ? d(exit) : null,
  createdAt: d('2020-01-01'),
  status,
  departmentName: dept,
});

describe('monthsBetween', () => {
  it('is inclusive and crosses year boundaries', () => {
    expect(monthsBetween(d('2025-11-15'), d('2026-02-01'))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('returns empty for inverted ranges', () => {
    expect(monthsBetween(d('2026-03-01'), d('2026-01-01'))).toEqual([]);
  });
});

describe('resolveReportRange', () => {
  const now = new Date('2026-06-15T10:00:00Z');
  it('defaults to the trailing six months', () => {
    const r = resolveReportRange(null, null, now);
    expect(r).toEqual({ from: d('2026-01-01'), to: d('2026-06-15') });
  });
  it('rejects malformed, inverted and oversized ranges', () => {
    expect(resolveReportRange('2026/01/01', null, now)).toHaveProperty('error');
    expect(resolveReportRange('2026-06-01', '2026-01-01', now)).toHaveProperty('error');
    expect(resolveReportRange('2020-01-01', '2026-01-01', now)).toHaveProperty('error');
    expect(resolveReportRange(null, 'nope', now)).toHaveProperty('error');
  });
  it('accepts exactly 24 months', () => {
    expect(resolveReportRange('2024-07-01', '2026-06-30', now)).not.toHaveProperty('error');
  });
});

describe('buildWorkforceReport', () => {
  const employees = [
    emp('a', '2025-01-10', null, 'Engineering'),
    emp('b', '2026-02-05', null, 'Sales'),
    emp('c', '2024-01-01', '2026-03-20', 'Engineering', 'INACTIVE'),
    emp('d', null, null, null),
  ];
  const attendance: ReportAttendance[] = [
    { employeeId: 'a', date: d('2026-02-02'), status: 'PRESENT' },
    { employeeId: 'a', date: d('2026-02-03'), status: 'LATE' },
    { employeeId: 'a', date: d('2026-02-04'), status: 'ABSENT' },
    { employeeId: 'a', date: d('2026-02-05'), status: 'HOLIDAY' },
    { employeeId: 'b', date: d('2026-03-02'), status: 'HALF_DAY' },
    { employeeId: 'b', date: d('2026-03-03'), status: 'REMOTE' },
  ];
  const leave: ReportLeave[] = [
    { startDate: d('2026-02-10'), days: 2, status: 'APPROVED', leaveTypeId: 'al', leaveTypeName: 'Annual', leaveTypeCode: 'AL' },
    { startDate: d('2026-02-20'), days: 0.5, status: 'APPROVED', leaveTypeId: 'al', leaveTypeName: 'Annual', leaveTypeCode: 'AL' },
    { startDate: d('2026-03-01'), days: 1, status: 'APPROVED', leaveTypeId: 'sl', leaveTypeName: 'Sick', leaveTypeCode: 'SL' },
    { startDate: d('2026-03-05'), days: 4, status: 'REJECTED', leaveTypeId: 'sl', leaveTypeName: 'Sick', leaveTypeCode: 'SL' },
    { startDate: d('2026-03-06'), days: 1, status: 'PENDING', leaveTypeId: 'sl', leaveTypeName: 'Sick', leaveTypeCode: 'SL' },
  ];
  const report = buildWorkforceReport({ from: d('2026-02-01'), to: d('2026-03-31'), employees, attendance, leave });

  it('computes month-end headcount, joiners and leavers', () => {
    expect(report.headcount.series).toEqual([
      { month: '2026-02', headcount: 4, joiners: 1, leavers: 0 },
      { month: '2026-03', headcount: 3, joiners: 0, leavers: 1 },
    ]);
  });

  it('counts only non-inactive staff by department, with an Unassigned bucket', () => {
    expect(report.headcount.current).toBe(3);
    expect(report.headcount.byDepartment).toEqual([
      { department: 'Engineering', count: 1 },
      { department: 'Sales', count: 1 },
      { department: 'Unassigned', count: 1 },
    ]);
  });

  it('excludes holidays from the attendance rate and weights half days', () => {
    // working records: P, L, A, H(0.5), R => (1+1+0+0.5+1)/5
    expect(report.attendance.attendanceRate).toBe(0.7);
    expect(report.attendance.totals.HOLIDAY).toBe(1);
    expect(report.attendance.recordsCounted).toBe(6);
    // 1 late of 4 present-type records (P, L, H, R)
    expect(report.attendance.lateRate).toBe(0.25);
  });

  it('breaks the attendance rate down by month', () => {
    expect(report.attendance.series).toEqual([
      { month: '2026-02', attendanceRate: 0.6667, records: 4 },
      { month: '2026-03', attendanceRate: 0.75, records: 2 },
    ]);
  });

  it('sums only approved leave days by type and counts statuses', () => {
    expect(report.leave.totalApprovedDays).toBe(3.5);
    expect(report.leave.byType).toEqual([
      { leaveTypeId: 'al', name: 'Annual', code: 'AL', approvedDays: 2.5, requests: 2 },
      { leaveTypeId: 'sl', name: 'Sick', code: 'SL', approvedDays: 1, requests: 1 },
    ]);
    expect(report.leave.statusCounts).toEqual({ PENDING: 1, APPROVED: 3, REJECTED: 1, CANCELLED: 0 });
  });

  it('returns null rates and empty collections when there is no data', () => {
    const empty = buildWorkforceReport({ from: d('2026-01-01'), to: d('2026-01-31'), employees: [], attendance: [], leave: [] });
    expect(empty.attendance.attendanceRate).toBeNull();
    expect(empty.attendance.lateRate).toBeNull();
    expect(empty.headcount.current).toBe(0);
    expect(empty.leave.byType).toEqual([]);
    expect(empty.headcount.series).toEqual([{ month: '2026-01', headcount: 0, joiners: 0, leavers: 0 }]);
  });
});
