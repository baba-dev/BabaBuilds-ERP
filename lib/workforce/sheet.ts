import { dayKey, isWorkingDay, utcDay } from './calendar';

/** One day in the monthly attendance sheet. */
export type SheetCode = 'P' | 'L' | 'R' | 'A' | 'H' | 'HOL' | 'OFF' | 'LV' | 'UL' | '' | '-';
// P present · L late · R remote · A absent · H half day · HOL holiday · OFF weekly off · LV paid leave · UL unpaid leave
// '' no record on a working day (not yet marked) · '-' not employed that day

export type SheetEmployee = { id: string; name: string; joinDate: Date | null; exitDate: Date | null };
export type SheetTotals = { present: number; late: number; remote: number; absent: number; halfDay: number; paidLeave: number; unpaidLeave: number; missing: number };
export type SheetRow = { employeeId: string; name: string; days: SheetCode[]; totals: SheetTotals };

export function buildSheet(args: {
  year: number; month: number; // 1-12
  employees: SheetEmployee[];
  attendance: { employeeId: string; date: Date; status: string }[];
  leaves: { employeeId: string; start: Date; end: Date; days: number; isPaid: boolean }[];
  workingDays: string[];
  holidays: Set<string>;
  today: Date;
}) {
  const first = new Date(Date.UTC(args.year, args.month - 1, 1));
  const count = new Date(Date.UTC(args.year, args.month, 0)).getUTCDate();
  const dates = Array.from({ length: count }, (_, i) => new Date(Date.UTC(args.year, args.month - 1, i + 1)));
  const att = new Map<string, string>();
  for (const a of args.attendance) att.set(`${a.employeeId}|${dayKey(utcDay(a.date))}`, a.status);
  const todayMs = utcDay(args.today).getTime();

  const rows: SheetRow[] = args.employees.map((e) => {
    const t: SheetTotals = { present: 0, late: 0, remote: 0, absent: 0, halfDay: 0, paidLeave: 0, unpaidLeave: 0, missing: 0 };
    const mine = args.leaves.filter((l) => l.employeeId === e.id);
    const days = dates.map((d): SheetCode => {
      const ms = d.getTime();
      if ((e.joinDate && ms < utcDay(e.joinDate).getTime()) || (e.exitDate && ms > utcDay(e.exitDate).getTime())) return '-';
      if (args.holidays.has(dayKey(d))) return 'HOL';
      if (!isWorkingDay(d, args.workingDays, args.holidays)) return 'OFF';
      const leave = mine.find((l) => utcDay(l.start).getTime() <= ms && utcDay(l.end).getTime() >= ms);
      if (leave) {
        const portion = utcDay(leave.start).getTime() === utcDay(leave.end).getTime() && leave.days < 1 ? leave.days : 1;
        if (leave.isPaid) t.paidLeave += portion; else t.unpaidLeave += portion;
        return leave.isPaid ? 'LV' : 'UL';
      }
      const s = att.get(`${e.id}|${dayKey(d)}`);
      if (s === 'PRESENT') { t.present += 1; return 'P'; }
      if (s === 'LATE') { t.late += 1; t.present += 1; return 'L'; }
      if (s === 'REMOTE') { t.remote += 1; t.present += 1; return 'R'; }
      if (s === 'HALF_DAY') { t.halfDay += 1; t.present += 0.5; return 'H'; }
      if (s === 'ABSENT') { t.absent += 1; return 'A'; }
      if (s === 'HOLIDAY') return 'HOL';
      if (ms > todayMs) return '';
      t.missing += 1;
      return '';
    });
    return { employeeId: e.id, name: e.name, days, totals: t };
  });
  return { year: args.year, month: args.month, first: dayKey(first), count, dates: dates.map((d) => ({ date: dayKey(d), dow: d.getUTCDay() })), rows };
}
