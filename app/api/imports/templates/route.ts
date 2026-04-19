import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTemplateCsv } from '@/lib/imports/templates/templates';
import { requireImportContext } from '@/lib/imports/core/auth';
import { IMPORT_ENTITY_KEYS } from '@/lib/imports/core/types';

const Query = z.object({ entity: z.enum(IMPORT_ENTITY_KEYS) });

export async function GET(req: NextRequest) {
  try {
    await requireImportContext();
    const parsed = Query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const csv = buildTemplateCsv(parsed.entity);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${parsed.entity}_import_template.csv"`,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'NO_WORKSPACE' ? 400 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
