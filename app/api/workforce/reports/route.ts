import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildWorkforceReport } from '@/lib/workforce/reports';
import { requireWorkforce, workforceErrorResponse } from '../_guard';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const q = z.object({ from: day.optional(), to: day.optional(), format: z.enum(['json', 'csv']).default('json') });

/** Headcount, attendance and leave figures. Default range: the last 90 days. Max one year. */
export async function GET(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.reports.view');
    if ('response' in g) return g.response;
    const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
    const to = p.to ?? iso(new Date());
    const from = p.from ?? iso(new Date(Date.now() - 89 * 86_400_000));
    if (from > to) return NextResponse.json({ code: 'INVALID_INPUT', error: 'The start date must be before the end date.' }, { status: 422 });
    if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) return NextResponse.json({ code: 'INVALID_INPUT', error: 'Pick a range of one year or less.' }, { status: 422 });
    const report = await buildWorkforceReport(g.access.workspaceId, from, to);
    if (p.format === 'csv') {
      const rows = [['Section', 'Item', 'Value'],
        ['Headcount', 'Active', report.headcount.active], ['Headcount', 'Joined', report.headcount.joined], ['Headcount', 'Left', report.headcount.left],
        ...report.headcount.byDepartment.map((d) => ['Department', d.name, d.count]),
        ['Attendance', 'Present days', report.attendance.present], ['Attendance', 'Late days', report.attendance.late], ['Attendance', 'Absent days', report.attendance.absent], ['Attendance', 'Not marked', report.attendance.missing],
        ...report.leave.byType.map((t) => ['Leave days', t.name, t.days])];
      const esc = (v: unknown) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
      return new NextResponse(rows.map((r) => r.map(esc).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="workforce-${from}-${to}.csv"` } });
    }
    return NextResponse.json(report);
  } catch (error) {
    return workforceErrorResponse(error, 'reports');
  }
}
