/**
 * Verifies that legacy optional modules stay default-enabled for backward
 * compatibility while still being first-class members of MODULE_KEYS.
 */
import { describe, it, expect } from 'vitest';
import {
  MODULE_KEYS,
  DEFAULT_ENABLED_MODULE_KEYS,
  isDefaultEnabledModule,
  isValidModuleKey,
} from '@/lib/module-keys';

const LEGACY_DEFAULT_ENABLED_MODULES = new Set(['SHOP', 'POS']);

describe('module-keys / default-enabled legacy modules', () => {
  it('SHOP and POS are registered as known module keys', () => {
    for (const key of LEGACY_DEFAULT_ENABLED_MODULES) {
      expect(MODULE_KEYS).toContain(key);
      expect(isValidModuleKey(key)).toBe(true);
    }
  });

  it('SHOP and POS are in DEFAULT_ENABLED_MODULE_KEYS', () => {
    for (const key of LEGACY_DEFAULT_ENABLED_MODULES) {
      expect(DEFAULT_ENABLED_MODULE_KEYS.has(key)).toBe(true);
      expect(isDefaultEnabledModule(key)).toBe(true);
    }
  });

  it('New opt-in modules are NOT default-enabled', () => {
    for (const key of MODULE_KEYS) {
      if (LEGACY_DEFAULT_ENABLED_MODULES.has(key)) continue;
      expect(isDefaultEnabledModule(key)).toBe(false);
    }
  });
});
