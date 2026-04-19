import 'server-only';

const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bPRAGMA\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bREINDEX\b/i,
  /\bVACUUM\b/i,
  /\bREPLACE\b/i,
  /\bTRUNCATE\b/i,
];

export class ReportingSqlPolicyError extends Error {
  constructor(public readonly code: 'INVALID_SQL' | 'MISSING_SCOPE' | 'FORBIDDEN_SQL') {
    super(code);
    this.name = 'ReportingSqlPolicyError';
  }
}

export function enforceReadOnlySqlPolicy(sql: string): void {
  const normalized = sql.trim();
  if (!normalized || !/^SELECT\b/i.test(normalized)) {
    throw new ReportingSqlPolicyError('INVALID_SQL');
  }

  // Single-statement only; allow a trailing semicolon.
  const semiCount = (normalized.match(/;/g) ?? []).length;
  if (semiCount > 1 || (semiCount === 1 && !normalized.endsWith(';'))) {
    throw new ReportingSqlPolicyError('INVALID_SQL');
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new ReportingSqlPolicyError('FORBIDDEN_SQL');
    }
  }

  if (!/\bworkspaceId\b\s*=\s*[:@$]?workspaceId\b/i.test(normalized)) {
    throw new ReportingSqlPolicyError('MISSING_SCOPE');
  }
}
