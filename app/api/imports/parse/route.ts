import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { importErrorResponse, requireImportContext } from '@/lib/imports/core/auth';
import { parseImportFile } from '@/lib/imports/core/parser';
import { getImportAdapter } from '@/lib/imports/adapters/entity-adapters';
import { deterministicMapping, getAiMappingSuggestions } from '@/lib/imports/ai/mapping-ai';
import { IMPORT_ENTITY_KEYS } from '@/lib/imports/core/types';

const Body = z.object({ entity: z.enum(IMPORT_ENTITY_KEYS), sourceMode: z.enum(['template', 'arbitrary']) });

export async function POST(req: Request) {
  try {
    const context = await requireImportContext();
    const limit = enforceRouteRateLimit({ request: req, route: '/api/imports/parse', scope: `${context.workspaceId}:${context.userId}`, max: 30, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const form = await req.formData();
    const file = form.get('file');
    const body = Body.parse({ entity: form.get('entity'), sourceMode: form.get('sourceMode') });
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }

    const parsed = await parseImportFile(file);
    const adapter = getImportAdapter(body.entity);
    const deterministic = deterministicMapping(parsed.headers, adapter.fields);
    const ai = await getAiMappingSuggestions({ workspaceId: context.workspaceId, headers: parsed.headers, fields: adapter.fields, sampleRows: parsed.sampleRows });

    return NextResponse.json({
      parsed,
      entity: body.entity,
      sourceMode: body.sourceMode,
      fields: adapter.fields,
      mappingSuggestions: ai.available && ai.suggestions.length > 0 ? ai.suggestions : deterministic,
      aiAvailable: ai.available,
      aiNotice: ai.available ? null : 'AI-assisted mapping is unavailable for this workspace. You can still complete the import manually.',
    });
  } catch (error) {
    return importErrorResponse(error, 'Parse failed');
  }
}
