import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireImportContext } from '@/lib/imports/core/auth';

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireImportContext();
    const { id } = await params;
    const run = await prisma.importRun.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { errorReportJson: true, fileName: true } });
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rows = Array.isArray(run.errorReportJson) ? run.errorReportJson as Array<{ rowNumber?: number; message?: string }> : [];
    const csv = ['rowNumber,message', ...rows.map((row) => `${csvEscape(String(row.rowNumber ?? ''))},${csvEscape(String(row.message ?? ''))}`)].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${(run.fileName || 'import').replace(/[^a-z0-9._-]/gi, '_')}_errors.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: message }, { status: 401 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
