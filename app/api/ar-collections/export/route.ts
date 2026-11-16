import { NextRequest, NextResponse } from 'next/server';
import { requireArAccess } from '@/lib/ar/access';
import { getArCollectionsSnapshot } from '@/lib/ar-collections';

const cell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  // A cell that starts with = + - or @ would run as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** The worklist as CSV for a call sheet or a hand-off to an agency. */
export async function GET(_request: NextRequest) {
  const auth = await requireArAccess('invoices.export');
  if (!auth.ok) return auth.response;
  const snap = await getArCollectionsSnapshot(auth.ctx.workspaceId, {});
  const head = ['Invoice', 'Customer', 'Due date', 'Days overdue', 'Outstanding', 'Currency', 'Status', 'Promise date', 'Last reminder', 'Reminders sent', 'Risk', 'Next action'];
  const lines = [head.map(cell).join(',')];
  for (const r of snap.rows) lines.push([r.invoiceNumber, r.clientName, r.dueDate.slice(0, 10), r.daysOverdue, r.outstanding.toFixed(2), snap.workspace.baseCurrency, r.followUpStatus, r.promiseDate?.slice(0, 10) ?? '', r.lastReminderSentAt?.slice(0, 10) ?? '', r.reminders, r.risk, r.action.kind].map(cell).join(','));
  return new NextResponse(`﻿${lines.join('\r\n')}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="collections.csv"', 'Cache-Control': 'no-store' } });
}
