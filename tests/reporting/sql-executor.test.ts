import { describe, expect, it } from 'vitest';
import { assertAllPlaceholdersBound } from '@/lib/reporting/sql-executor';

describe('sql executor placeholders', () => {
  it('throws when a bound param is missing', () => {
    expect(() =>
      assertAllPlaceholdersBound('SELECT * FROM Invoice WHERE workspaceId = :workspaceId AND id = :id', {
        workspaceId: 'w1',
      }),
    ).toThrow('MISSING_SQL_PARAM');
  });

  it('accepts when all placeholders present', () => {
    expect(() =>
      assertAllPlaceholdersBound('SELECT * FROM Invoice WHERE workspaceId = :workspaceId', {
        workspaceId: 'w1',
      }),
    ).not.toThrow();
  });
});
