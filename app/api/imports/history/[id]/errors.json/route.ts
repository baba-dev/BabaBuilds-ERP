import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireImportContext } from '@/lib/imports/core/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireImportContext();
    const { id } = await params;
    const run = await prisma.importRun.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { errorReportJson: true } });
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ errors: run.errorReportJson ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: message }, { status: 401 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
