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

function materializeQuery(sqlTemplate: string, params: Record<string, unknown>) {
  const values: unknown[] = [];
  const sql = sqlTemplate.replace(/:([a-zA-Z0-9_]+)/g, (_m, key: string) => {
    values.push(params[key]);
    return '?';
  });
  return { sql, values };
}

export async function executeReportingQuery(
  sqlTemplate: string,
  params: Record<string, unknown>,
): Promise<ReportingExecutionResult> {
  enforceReadOnlySqlPolicy(sqlTemplate);
  const { sql, values } = materializeQuery(sqlTemplate, params);

  const started = Date.now();
  const queryPromise = prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('REPORT_TIMEOUT')), EXECUTION_TIMEOUT_MS);
  });

  const allRows = await Promise.race([queryPromise, timeoutPromise]);
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
