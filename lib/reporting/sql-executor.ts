import 'server-only';
import { prisma } from '@/lib/prisma';
import { enforceReadOnlySqlPolicy } from '@/lib/reporting/sql-policy';

export type ReportingExecutionResult = {
  rows: Record<string, unknown>[];
  durationMs: number;
};

const ROW_CAP = 1000;
const PAYLOAD_CAP_BYTES = 1_000_000;
const EXECUTION_TIMEOUT_MS = 5_000;

const PLACEHOLDER_RE = /:([a-zA-Z0-9_]+)/g;

function collectPlaceholders(sqlTemplate: string): Set<string> {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE);
  while ((m = re.exec(sqlTemplate)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

export function assertAllPlaceholdersBound(sqlTemplate: string, params: Record<string, unknown>): void {
  const needed = collectPlaceholders(sqlTemplate);
  for (const key of needed) {
    if (!(key in params) || params[key] === undefined) {
      throw new Error('MISSING_SQL_PARAM');
    }
  }
}

function materializeQuery(sqlTemplate: string, params: Record<string, unknown>) {
  const values: unknown[] = [];
  const sql = sqlTemplate.replace(/:([a-zA-Z0-9_]+)/g, (_m, key: string) => {
    values.push(params[key]);
    return '?';
  });
  return { sql, values };
}

/**
 * Note: Promise.race timeout does not cancel the underlying SQLite query; the connection may
 * still complete work server-side. Prefer narrow filters and low caps for heavy workspaces.
 */
export async function executeReportingQuery(
  sqlTemplate: string,
  params: Record<string, unknown>,
): Promise<ReportingExecutionResult> {
  enforceReadOnlySqlPolicy(sqlTemplate);
  assertAllPlaceholdersBound(sqlTemplate, params);
  const { sql, values } = materializeQuery(sqlTemplate, params);

  const started = Date.now();
  const queryPromise = prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('REPORT_TIMEOUT')), EXECUTION_TIMEOUT_MS);
  });

  let allRows: Record<string, unknown>[];
  try {
    allRows = await Promise.race([queryPromise, timeoutPromise]);
  } catch (e) {
    if (e instanceof Error && e.message === 'REPORT_TIMEOUT') {
      console.warn('[reporting] query timeout', { elapsedMs: Date.now() - started });
    }
    throw e;
  }

  const rows = allRows.slice(0, ROW_CAP);
  const sizeBytes = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  if (sizeBytes > PAYLOAD_CAP_BYTES) {
    throw new Error('REPORT_PAYLOAD_TOO_LARGE');
  }

  return {
    rows,
    durationMs: Date.now() - started,
  };
}
