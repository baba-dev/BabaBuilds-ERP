import { describe, expect, it } from 'vitest';
import { enforceReadOnlySqlPolicy } from '@/lib/reporting/sql-policy';

describe('reporting sql policy', () => {
  it('allows scoped select queries', () => {
    expect(() => enforceReadOnlySqlPolicy('SELECT * FROM Invoice WHERE workspaceId = :workspaceId')).not.toThrow();
  });

  it('rejects non-select statements', () => {
    expect(() => enforceReadOnlySqlPolicy('DELETE FROM Invoice WHERE workspaceId = :workspaceId')).toThrow();
  });

  it('rejects unscoped queries', () => {
    expect(() => enforceReadOnlySqlPolicy('SELECT * FROM Invoice')).toThrow();
  });
});
