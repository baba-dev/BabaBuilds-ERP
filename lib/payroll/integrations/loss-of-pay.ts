/**
 * Works out loss-of-pay days from Workforce attendance and approved leave. Pure so the rules are easy to test.
 *
 * Rules, per working day inside the employee's period of employment:
 *  - a day covered by approved unpaid leave counts as loss of pay (half a day for a half-day leave);
 *  - a day covered by approved paid leave never does;
 *  - otherwise an absent attendance record counts as one day and a half-day record as half a day;
 *  - a day with no record counts as nothing, and is reported so the preparer can check it.
 * Weekly offs and company holidays are never loss of pay.
 */

export type LopLeave = { start: Date; end: Date; days: number; isPaid: boolean };
export type LopAttendance = { date: Date; status: string };

export type LopResult = { lopDays: number; unpaidLeaveDays: number; absentDays: number; halfDays: number; missingDays: number };

const DAY = 86_400_000;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const key = (d: Date) => d.toISOString().slice(0, 10);
const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function deriveLossOfPay(args: {
  periodStart: Date;
  periodEnd: Date;
  workingDays: string[];
  holidays: Set<string>;
  joinDate?: Date | null;
  exitDate?: Date | null;
  attendance: LopAttendance[];
  leaves: LopLeave[];
}): LopResult {
  const from = Math.max(dayStart(args.periodStart), args.joinDate ? dayStart(args.joinDate) : -Infinity);
  const to = Math.min(dayStart(args.periodEnd), args.exitDate ? dayStart(args.exitDate) : Infinity);
  const att = new Map<string, string>();
  for (const a of args.attendance) att.set(key(a.date), a.status);
  const working = new Set(args.workingDays.map((d) => d.toUpperCase()));

  const out: LopResult = { lopDays: 0, unpaidLeaveDays: 0, absentDays: 0, halfDays: 0, missingDays: 0 };
  for (let t = from; t <= to; t += DAY) {
    const day = new Date(t);
    const iso = key(day);
    if (!working.has(WEEKDAYS[day.getUTCDay()]!) || args.holidays.has(iso)) continue;

    const leave = args.leaves.find((l) => dayStart(l.start) <= t && dayStart(l.end) >= t);
    if (leave) {
      if (!leave.isPaid) {
        const single = dayStart(leave.start) === dayStart(leave.end);
        const portion = single && leave.days > 0 && leave.days < 1 ? leave.days : 1;
        out.unpaidLeaveDays += portion;
        out.lopDays += portion;
      }
      continue;
    }
    const status = att.get(iso);
    if (status === 'ABSENT') {
      out.absentDays += 1;
      out.lopDays += 1;
    } else if (status === 'HALF_DAY') {
      out.halfDays += 1;
      out.lopDays += 0.5;
    } else if (!status) {
      out.missingDays += 1;
    }
  }
  return out;
}
