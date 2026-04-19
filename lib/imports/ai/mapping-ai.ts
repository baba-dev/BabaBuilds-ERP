import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import type { FieldDefinition, MappingSuggestion } from '@/lib/imports/core/types';

type AiResult = { available: boolean; suggestions: MappingSuggestion[] };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function getAiMappingSuggestions(args: {
  workspaceId: string;
  headers: string[];
  fields: FieldDefinition[];
  sampleRows: string[][];
}): Promise<AiResult> {
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId: args.workspaceId }, select: { groqApiKey: true } });
  const envKey = process.env.GROQ_API_KEY;
  let key = envKey || '';
  if (!key && profile?.groqApiKey) {
    try {
      key = decrypt(profile.groqApiKey);
    } catch {
      key = profile.groqApiKey;
    }
  }
  if (!key) return { available: false, suggestions: [] };

  try {
    const client = new Groq({ apiKey: key });
    const prompt = JSON.stringify({ headers: args.headers, fields: args.fields.map((f) => ({ key: f.key, label: f.label })), sampleRows: args.sampleRows.slice(0, 3) });
    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Map source headers to target fields. Return JSON: {"mappings":[{"sourceHeader":"...","targetField":"...","confidence":0.0,"reason":"..."}]}' },
        { role: 'user', content: prompt },
      ],
    });
    const text = completion.choices[0]?.message?.content || '{"mappings":[]}';
    const parsed = JSON.parse(text) as { mappings?: Array<{ sourceHeader: string; targetField: string | null; confidence?: number; reason?: string }> };
    const suggestions: MappingSuggestion[] = (parsed.mappings ?? []).map((item) => ({
      sourceHeader: item.sourceHeader,
      targetField: item.targetField,
      confidence: Math.max(0, Math.min(1, item.confidence ?? 0.5)),
      source: 'ai',
      reason: item.reason,
    }));
    return { available: true, suggestions };
  } catch {
    // graceful fallback: AI unavailable at runtime
    return { available: false, suggestions: [] };
  }
}

export function deterministicMapping(headers: string[], fields: FieldDefinition[]): MappingSuggestion[] {
  return headers.map((header) => {
    const key = normalize(header);
    const match = fields.find((f) => [f.key, f.label, ...(f.synonyms ?? [])].some((candidate) => normalize(candidate) === key || normalize(candidate).includes(key) || key.includes(normalize(candidate))));
    return {
      sourceHeader: header,
      targetField: match?.key ?? null,
      confidence: match ? 0.76 : 0,
      source: 'synonym' as const,
      reason: match ? 'Matched using built-in synonyms.' : 'No deterministic match found.',
    };
  });
}
