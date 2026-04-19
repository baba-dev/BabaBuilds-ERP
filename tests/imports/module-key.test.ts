import { describe, expect, it } from 'vitest';
import { MODULE_KEYS, isValidModuleKey } from '@/lib/modules';

describe('IMPORT_MANAGER module registration', () => {
  it('is present in workspace module registry', () => {
    expect(MODULE_KEYS.includes('IMPORT_MANAGER')).toBe(true);
    expect(isValidModuleKey('IMPORT_MANAGER')).toBe(true);
  });
});
