import { describe, expect, it } from 'vitest';
import { hasPermission } from '@/lib/permissions';

describe('reporting center permission matrix', () => {
  it('grants top-level roles reporting center access', () => {
    expect(hasPermission('OWNER', 'reporting_center.view')).toBe(true);
    expect(hasPermission('ADMIN', 'reporting_center.query.run')).toBe(true);
    expect(hasPermission('FINANCE_MANAGER', 'reporting_center.export')).toBe(true);
  });

  it('restricts lower roles from reporting center run/export', () => {
    expect(hasPermission('STAFF', 'reporting_center.view')).toBe(false);
    expect(hasPermission('VIEWER', 'reporting_center.query.run')).toBe(false);
  });
});
