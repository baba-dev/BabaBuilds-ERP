/**
 * Verifies that SHOP is wired as a default-enabled optional module so that the
 * existing storefront stays available out-of-the-box, while still being a
 * first-class member of MODULE_KEYS / DEFAULT_ENABLED_MODULE_KEYS.
 */
import { describe, it, expect } from 'vitest';
import {
  MODULE_KEYS,
  DEFAULT_ENABLED_MODULE_KEYS,
  isDefaultEnabledModule,
  isValidModuleKey,
} from '@/lib/module-keys';

describe('module-keys / SHOP defaults', () => {
  it('SHOP is registered as a known module key', () => {
    expect(MODULE_KEYS).toContain('SHOP');
    expect(isValidModuleKey('SHOP')).toBe(true);
  });

  it('SHOP is in DEFAULT_ENABLED_MODULE_KEYS', () => {
    expect(DEFAULT_ENABLED_MODULE_KEYS.has('SHOP')).toBe(true);
    expect(isDefaultEnabledModule('SHOP')).toBe(true);
  });

  it('Other optional modules are NOT default-enabled (opt-in only)', () => {
    for (const key of MODULE_KEYS) {
      if (key === 'SHOP') continue;
      expect(isDefaultEnabledModule(key)).toBe(false);
    }
  });
});
