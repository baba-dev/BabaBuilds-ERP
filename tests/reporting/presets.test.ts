import { describe, expect, it } from 'vitest';
import { getReportPreset, validatePresetFilters } from '@/lib/reporting/presets';

describe('reporting preset filters', () => {
  it('requires mandatory filters', () => {
    const preset = getReportPreset('expense_register');
    expect(preset).toBeTruthy();
    expect(() => validatePresetFilters(preset!, {})).toThrow(/FILTER_REQUIRED/);
  });

  it('accepts valid date filters', () => {
    const preset = getReportPreset('expense_register');
    const parsed = validatePresetFilters(preset!, {
      fromDate: new Date('2026-01-01').toISOString(),
      toDate: new Date('2026-01-31').toISOString(),
    });
    expect(parsed.fromDate).toBeTruthy();
  });
});
