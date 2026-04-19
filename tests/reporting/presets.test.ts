import { describe, expect, it } from 'vitest';
import {
  getReportPreset,
  listPublicPresets,
  toPublicPreset,
  validatePresetFilters,
} from '@/lib/reporting/presets';

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

  it('never exposes sql in public presets', () => {
    for (const p of listPublicPresets()) {
      expect(p).not.toHaveProperty('sql');
      expect(JSON.stringify(p)).not.toContain('FROM ');
    }

    const preset = getReportPreset('invoice_register');
    expect(preset?.sql).toContain('FROM');

    const pub = toPublicPreset(preset!);
    expect(pub).not.toHaveProperty('sql');
  });
});