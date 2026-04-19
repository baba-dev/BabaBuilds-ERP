import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireImportContext } from '@/lib/imports/core/auth';
import { executeImport } from '@/lib/imports/core/execute';
import { buildPreview } from '@/lib/imports/core/preview';
import { computeImportDigest } from '@/lib/imports/core/digest';
import type { ImportExecutionMode } from '@/lib/imports/core/types';

const Mapping = z.object({ sourceHeader: z.string(), targetField: z.string().nullable(), confidence: z.number(), source: z.enum(['synonym', 'ai', 'manual']), reason: z.string().optional() });
const StoredInput = z.object({
  entity: z.enum(['clients', 'services', 'shop_items', 'inventory', 'proposals', 'expenses']),
  sourceMode: z.enum(['template', 'arbitrary']),
  fileName: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  mappings: z.array(Mapping),
  aiUsed: z.boolean().default(false),
});
const Body = z.object({ previewRunId: z.string().min(1), mode: z.enum(['create_only', 'upsert']) });

function idempotencyFromRequest(req: Request, runId: string, mode: ImportExecutionMode, userId: string): string {
  return req.headers.get('Idempotency-Key') || `import:${runId}:${mode}:${userId}`;
}

export async function POST(req: Request) {
  try {
    const context = await requireImportContext();
    const body = Body.parse(await req.json());

    const run = await prisma.importRun.findFirst({ where: { id: body.previewRunId, workspaceId: context.workspaceId } });
    if (!run) return NextResponse.json({ error: 'Preview run not found.' }, { status: 404 });

    const idempotencyKey = idempotencyFromRequest(req, run.id, body.mode, context.userId);

    if (run.status === 'COMPLETED' && run.idempotencyKey === idempotencyKey) {
      return NextResponse.json({ summary: run.resultJson ?? null, idempotentReplay: true });
    }
    if (run.status === 'EXECUTING') {
      return NextResponse.json({ error: 'Import is already executing for this run.' }, { status: 409 });
    }

    const lock = await prisma.importRun.updateMany({
      where: { id: run.id, workspaceId: context.workspaceId, status: 'PREVIEW_READY' },
      data: { status: 'EXECUTING', idempotencyKey, executionStartedAt: new Date() },
    });
    if (lock.count === 0) {
      return NextResponse.json({ error: 'Import run is not in executable state.' }, { status: 409 });
    }

    const storedInput = StoredInput.parse(run.inputJson);
    const digest = computeImportDigest(storedInput);
    if (!run.sourceDigest || digest !== run.sourceDigest) {
      await prisma.importRun.update({ where: { id: run.id }, data: { status: 'FAILED', failedCount: run.failedCount + 1, executionFinishedAt: new Date() } });
      return NextResponse.json({ error: 'Source payload integrity check failed.' }, { status: 409 });
    }

    const freshPreview = buildPreview(storedInput);
    if (freshPreview.requiredUnmapped.length > 0 || freshPreview.counts.errors > 0) {
      await prisma.importRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          failedCount: freshPreview.counts.errors,
          skippedCount: freshPreview.counts.skipped,
          previewJson: freshPreview as unknown as object,
          executionFinishedAt: new Date(),
        },
      });
      return NextResponse.json({ error: 'Blocking validation errors remain. Resolve before execute.', preview: freshPreview }, { status: 400 });
    }

    const summary = await executeImport({
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      preview: freshPreview,
      mode: body.mode,
      onChunkCommitted: async (lastProcessedRow, counts) => {
        await prisma.importRun.update({
          where: { id: run.id },
          data: {
            lastProcessedRow,
            importedCount: counts.imported,
            updatedCount: counts.updated,
            skippedCount: counts.skipped,
            failedCount: counts.failed,
          },
        });
      },
    });

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        executionMode: body.mode,
        importedCount: summary.imported,
        updatedCount: summary.updated,
        skippedCount: summary.skipped,
        failedCount: summary.failed,
        lastProcessedRow: summary.lastProcessedRow,
        resultJson: summary as unknown as object,
        errorReportJson: summary.errorRows as unknown as object,
        executionFinishedAt: new Date(),
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
