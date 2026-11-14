import 'server-only';
import { prisma } from '@/lib/prisma';
import { resolvePeriod, previousRange, yearAgoRange, type PeriodKey, type PeriodRange } from '@/lib/expenses/period';
import { checkPermissionSilent } from '@/lib/rbac';
import { CORE_REPORTS } from '@/lib/reporting/core-reports';
import { STATEMENT_REPORTS } from '@/lib/reporting/statements-reports';
import { EXTRA_REPORTS } from '@/lib/reporting/extra-reports';
import { LINEAGE } from '@/lib/reporting/lineage';
import { qualityFor } from '@/lib/reporting/quality';
import { buildInsights, sparkFor } from '@/lib/reporting/insights';
import { runCustomReport, CUSTOM_REPORT_META } from '@/lib/reporting/builder';
import type { Ctx, ReportBody, ReportDef, ReportResult } from '@/lib/reporting/types';

export type { Col, Cell, Format, Kpi, Row, ReportResult, ReportDef, ChartSpec, QualityIssue, Insight } from '@/lib/reporting/types';

export const REPORTS: ReportDef[] = [...CORE_REPORTS, ...STATEMENT_REPORTS, ...EXTRA_REPORTS].map((r) => ({
  ...r, lineage: LINEAGE[r.id] ?? { sources: [], rules: [] },
  // Light reports that many people open at once; a short cache keeps the database calm.
  cacheSeconds: r.cacheSeconds ?? (['cash_forecast', 'ar_aging', 'ap_aging', 'financial_position', 'mrr'].includes(r.id) ? 30 : 0),
}));

export const getReport = (id: string): ReportDef | null => REPORTS.find((r) => r.id === id) ?? (id === 'custom' ? CUSTOM_REPORT_META : null);
export const listReports = () => REPORTS.map(({ build: _b, ...r }) => r);

/** Can this person open this report? Reports with sensitive content need their own module permission as well. */
export async function reportAllowed(def: Pick<ReportDef, 'requires'>, userId: string, workspaceId: string): Promise<boolean> {
  return !def.requires || (await checkPermissionSilent(userId, workspaceId, def.requires));
}

export type CompareMode = 'previous' | 'yoy';
export type RunInput = { reportId: string; period?: PeriodKey; from?: string | null; to?: string | null; compare?: boolean | CompareMode; spec?: unknown };

const cache = new Map<string, { at: number; value: ReportResult }>();
const CACHE_MAX = 200;

export async function runReport(workspaceId: string, userId: string, input: RunInput, now = new Date()): Promise<ReportResult | null> {
  const def = getReport(input.reportId);
  if (!def) return null;
  const compareMode: CompareMode | null = def.comparable && input.compare ? (input.compare === 'yoy' ? 'yoy' : 'previous') : null;

  const cacheKey = def.cacheSeconds && input.reportId !== 'custom' ? `${workspaceId}|${userId}|${input.reportId}|${input.period}|${input.from}|${input.to}|${compareMode}` : null;
  if (cacheKey) { const hit = cache.get(cacheKey); if (hit && now.getTime() - hit.at < (def.cacheSeconds ?? 0) * 1000) return hit.value; }

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true, countryCode: true } });
  const countryCode = ws?.countryCode ?? 'IN';
  const range: PeriodRange = def.period === 'range' ? resolvePeriod(input.period ?? 'this_fy', countryCode, now, { from: input.from, to: input.to }) : resolvePeriod('all', countryCode, now);
  const ctx: Ctx = { workspaceId, userId, range, now, currency: ws?.baseCurrency ?? 'INR', countryCode };
  const other = compareMode === 'yoy' ? yearAgoRange(range) : compareMode === 'previous' ? previousRange(range) : null;

  const run = (c: Ctx): Promise<ReportBody> => (def.id === 'custom' ? runCustomReport(c, input.spec) : def.build(c));
  const [body, before, quality] = await Promise.all([run(ctx), other ? run({ ...ctx, range: other }) : Promise.resolve(null), qualityFor(def.id, ctx).catch(() => [])]);

  const kpis = body.kpis.map((k) => ({ ...k, spark: sparkFor(k.key, body) }));
  const result: ReportResult = {
    ...body, kpis, quality, insights: buildInsights(body, before?.kpis), currency: ctx.currency, generatedAt: now.toISOString(),
    range: def.period === 'range' ? { key: range.key, from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null } : null,
    ...(before ? { previous: before.kpis, compareMode: compareMode ?? undefined } : {}),
  };
  if (cacheKey) { if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string); cache.set(cacheKey, { at: now.getTime(), value: result }); }
  return result;
}

export async function reportToCsv(def: Pick<ReportDef, 'id' | 'title'>, result: ReportResult, labels: Record<string, string>): Promise<string> {
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const head = result.columns.map((c) => cell(labels[c.key] ?? c.key)).join(',');
  const lines = result.rows.map((r) => result.columns.map((c) => cell(r[c.key])).join(','));
  if (result.totals) lines.push(result.columns.map((c, i) => cell(i === 0 ? (labels.total ?? 'Total') : result.totals![c.key])).join(','));
  return `﻿${[head, ...lines].join('\r\n')}`;
}
