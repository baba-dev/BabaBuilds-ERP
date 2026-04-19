import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireImportContext } from '@/lib/imports/core/auth';

export async function GET() {
  try {
    const context = await requireImportContext();
    const history = await prisma.importRun.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        entityKey: true,
        fileName: true,
        sourceMode: true,
        aiUsed: true,
        executionMode: true,
        parsedCount: true,
        importedCount: true,
        updatedCount: true,
        skippedCount: true,
        failedCount: true,
        lastProcessedRow: true,
        status: true,
        createdAt: true,
        executionStartedAt: true,
        executionFinishedAt: true,
        initiatedByUserId: true,
      },
    });
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'History failed';
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: message }, { status: 401 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
