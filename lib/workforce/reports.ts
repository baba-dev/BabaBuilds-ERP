import 'server-only';

import { prisma } from '@/lib/prisma';
import { dayKey, utcDay } from './calendar';
import { loadCalendar } from './leave-service';
import { monthSheet } from './attendance-service';

export type WorkforceReport = {
  from: string; to: string;
  headcount: { active: number; joined: number; left: number; byDepartment: { name: string; count: number }[]; months: { month: string; joined: number; left: number }[] };
  attendance: { present: number; late: number; remote: number; halfDay: number; absent: number; missing: number; lateRate: number; byEmployee: { name: string; late: number; absent: number; missing: number }[] };
  leave: { requests: number; days: number; byType: { name: string; days: number }[]; byMonth: { month: string; days: number }[]; pending: number };
};

const monthKey = (d: Date) => dayKey(d).slice(0, 7);

/** Headcount, attendance and leave figures for a date range (UTC days, same as the rest of Workforce). */
export async function buildWorkforceReport(workspaceId: string, fromStr: string, toStr: string): Promise<WorkforceReport> {
  const from = utcDay(fromStr), to = utcDay(toStr);
  const [people, leaves] = await Promise.all([
    prisma.employee.findMany({ where: { workspaceId }, select: { status: true, joinDate: true, exitDate: true, department: { select: { name: true } } } }),
    prisma.leaveRequest.findMany({ where: { workspaceId, status: { in: ['APPROVED', 'PENDING'] }, startDate: { lte: to }, endDate: { gte: from } }, select: { status: true, days: true, startDate: true, endDate: true, leaveType: { select: { name: true } } } }),
  ]);
  const inRange = (d: Date | null) => !!d && d >= from && d <= to;
  const deptCount = new Map<string, number>();
  for (const p of people) if (p.status !== 'INACTIVE') { const n = p.department?.name ?? '—'; deptCount.set(n, (deptCount.get(n) ?? 0) + 1); }
  const months = new Map<string, { joined: number; left: number }>();
  const bump = (d: Date, k: 'joined' | 'left') => { const m = months.get(monthKey(d)) ?? { joined: 0, left: 0 }; m[k] += 1; months.set(monthKey(d), m); };
  for (const p of people) { if (inRange(p.joinDate)) bump(p.joinDate!, 'joined'); if (inRange(p.exitDate)) bump(p.exitDate!, 'left'); }

  // Attendance: add up each month's sheet inside the range (days outside the range are ignored).
  const tot = { present: 0, late: 0, remote: 0, halfDay: 0, absent: 0, missing: 0 };
  const per = new Map<string, { name: string; late: number; absent: number; missing: number }>();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor <= to) {
    const sheet = await monthSheet({ workspaceId, year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    for (const row of sheet.rows) {
      const e = per.get(row.employeeId) ?? { name: row.name, late: 0, absent: 0, missing: 0 };
      row.days.forEach((code, i) => {
        const date = utcDay(sheet.dates[i]!.date);
        if (date < from || date > to) return;
        if (code === 'P') tot.present += 1;
        else if (code === 'L') { tot.late += 1; tot.present += 1; e.late += 1; }
        else if (code === 'R') { tot.remote += 1; tot.present += 1; }
        else if (code === 'H') tot.halfDay += 1;
        else if (code === 'A') { tot.absent += 1; e.absent += 1; }
        else if (code === '') { tot.missing += 1; e.missing += 1; }
      });
      per.set(row.employeeId, e);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const cal = await loadCalendar(workspaceId, from, to);
  void cal; // calendar is applied inside monthSheet; kept so an invalid workspace fails the same way as other reads
  const byType = new Map<string, number>(), byMonth = new Map<string, number>();
  let days = 0, pending = 0;
  for (const l of leaves) {
    if (l.status === 'PENDING') { pending += 1; continue; }
    days += l.days; byType.set(l.leaveType.name, (byType.get(l.leaveType.name) ?? 0) + l.days);
    byMonth.set(monthKey(l.startDate), (byMonth.get(monthKey(l.startDate)) ?? 0) + l.days);
  }
  const marked = tot.present + tot.halfDay + tot.absent;
  const sort = <T,>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    from: fromStr, to: toStr,
    headcount: { active: people.filter((p) => p.status !== 'INACTIVE').length, joined: [...months.values()].reduce((n, m) => n + m.joined, 0), left: [...months.values()].reduce((n, m) => n + m.left, 0), byDepartment: [...deptCount].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), months: sort(months).map(([month, v]) => ({ month, ...v })) },
    attendance: { ...tot, lateRate: marked ? Math.round((tot.late / marked) * 1000) / 10 : 0, byEmployee: [...per.values()].filter((e) => e.late + e.absent + e.missing > 0).sort((a, b) => b.late + b.absent + b.missing - (a.late + a.absent + a.missing)).slice(0, 10) },
    leave: { requests: leaves.length, days, byType: [...byType].map(([name, d]) => ({ name, days: d })).sort((a, b) => b.days - a.days), byMonth: sort(byMonth).map(([month, d]) => ({ month, days: d })), pending },
  };
}
