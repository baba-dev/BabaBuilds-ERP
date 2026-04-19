import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireImportContext } from '@/lib/imports/core/auth';
import { executeImport } from '@/lib/imports/core/execute';
import type { ImportPreview } from '@/lib/imports/core/types';

const Body = z.object({ previewRunId: z.string().min(1), mode: z.enum(['create_only', 'upsert']) });

export async function POST(req: Request) {
  try {
    const context = await requireImportContext();
    const body = Body.parse(await req.json());

    const run = await prisma.importRun.findFirst({ where: { id: body.previewRunId, workspaceId: context.workspaceId } });
    if (!run) return NextResponse.json({ error: 'Preview run not found.' }, { status: 404 });
    const preview = run.previewJson as unknown as ImportPreview;

    const summary = await executeImport({ workspaceId: context.workspaceId, actorUserId: context.userId, preview, mode: body.mode });
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        executionMode: body.mode,
        importedCount: summary.imported,
        updatedCount: summary.updated,
        skippedCount: summary.skipped,
        failedCount: summary.failed,
        resultJson: summary as unknown as object,
      },
    });

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed';
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: message }, { status: 401 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
