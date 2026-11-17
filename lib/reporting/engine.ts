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
import { cachedDataSnapshot, isRedisDataCacheEnabled } from '@/lib/redis/data-cache';
import { resolveLiveCacheAuthorization } from '@/lib/redis/cache-authorization';

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

/**
 * Only these built-in interactive reports are eligible for shared Redis caching.
 * PDF/CSV exports, scheduled emails and immutable external-share snapshots never
 * opt in, and continue to compute directly from PostgreSQL while Redis mode is on.
 */
const REDIS_INTERACTIVE_REPORTS = new Set([
  'cash_forecast', 'ar_aging', 'ap_aging', 'financial_position', 'mrr',
]);

export async function runReport(
  workspaceId: string,
  userId: string,
  input: RunInput,
  now = new Date(),
  options: { interactiveCache?: boolean } = {},
): Promise<ReportResult | null> {
  const def = getReport(input.reportId);
  if (!def) return null;
  const compareMode: CompareMode | null = def.comparable && input.compare
    ? (input.compare === 'yoy' ? 'yoy' : 'previous') : null;

  let redisReportMode = false;
  try {
    redisReportMode = isRedisDataCacheEnabled('report');
  } catch {
    // Configuration errors must not prevent authoritative reporting queries.
    redisReportMode = true; // bypass legacy per-process cache when requested.
  }
  const legacyKey = !redisReportMode && def.cacheSeconds && input.reportId !== 'custom'
    ? [workspaceId, userId, input.reportId, input.period, input.from, input.to, compareMode].join('|')
    : null;
  if (legacyKey) {
    const hit = cache.get(legacyKey);
    if (hit && now.getTime() - hit.at < (def.cacheSeconds ?? 0) * 1000) return hit.value;
  }

  const calculate = async (): Promise<ReportResult> => {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { baseCurrency: true, countryCode: true },
    });
    const countryCode = ws?.countryCode ?? 'IN';
    const range: PeriodRange = def.period === 'range'
      ? resolvePeriod(input.period ?? 'this_fy', countryCode, now, { from: input.from, to: input.to })
      : resolvePeriod('all', countryCode, now);
    const ctx: Ctx = {
      workspaceId, userId, range, now,
      currency: ws?.baseCurrency ?? 'INR', countryCode,
    };
    const other = compareMode === 'yoy' ? yearAgoRange(range)
      : compareMode === 'previous' ? previousRange(range) : null;
    const run = (c: Ctx): Promise<ReportBody> => def.id === 'custom'
      ? runCustomReport(c, input.spec) : def.build(c);
    const [body, before, quality] = await Promise.all([
      run(ctx),
      other ? run({ ...ctx, range: other }) : Promise.resolve(null),
      qualityFor(def.id, ctx).catch(() => []),
    ]);
    const kpis = body.kpis.map((k) => ({ ...k, spark: sparkFor(k.key, body) }));
    return {
      ...body, kpis, quality,
      insights: buildInsights(body, before?.kpis),
      currency: ctx.currency,
      generatedAt: now.toISOString(),
      range: def.period === 'range'
        ? { key: range.key, from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null }
        : null,
      ...(before ? { previous: before.kpis, compareMode: compareMode ?? undefined } : {}),
    };
  };

  if (redisReportMode && options.interactiveCache &&
      REDIS_INTERACTIVE_REPORTS.has(def.id) && def.cacheSeconds &&
      input.reportId !== 'custom') {
    // Always inspect the user's current workspace role, report permission
    // and enabled modules BEFORE a potential Redis hit.
    const access = await resolveLiveCacheAuthorization(
      userId, workspaceId, 'reporting_center.view',
    );
    if (access && await reportAllowed(def, userId, workspaceId)) {
      const snapshot = await cachedDataSnapshot('report', {
        workspaceId, userId,
        authorizationFingerprint: access.fingerprint,
        variant: JSON.stringify([
          input.reportId, input.period ?? null, input.from ?? null,
          input.to ?? null, compareMode,
        ]),
      }, def.cacheSeconds, calculate);
      return snapshot.value;
    }
  }

  const result = await calculate();
  if (legacyKey) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(legacyKey, { at: now.getTime(), value: result });
  }
  return result;
}

export async function reportToCsv(def: Pick<ReportDef, 'id' | 'title'>, result: ReportResult, labels: Record<string, string>): Promise<string> {
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const head = result.columns.map((c) => cell(labels[c.key] ?? c.key)).join(',');
  const lines = result.rows.map((r) => result.columns.map((c) => cell(r[c.key])).join(','));
  if (result.totals) lines.push(result.columns.map((c, i) => cell(i === 0 ? (labels.total ?? 'Total') : result.totals![c.key])).join(','));
  return `﻿${[head, ...lines].join('\r\n')}`;
}
