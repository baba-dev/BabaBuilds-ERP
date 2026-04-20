import { describe, expect, it } from 'vitest';
import { getCompliancePack, getSupportedCompliancePacks, resolveJurisdictionalRate } from '@/lib/tax/compliance-packs';

describe('compliance country packs', () => {
  it('supports all requested countries with correction-enabled packs', () => {
    const expected = ['IN', 'US', 'SA', 'AE', 'OM', 'QA', 'BH', 'KW', 'BR', 'MX', 'DE', 'IT', 'GB', 'CA'];
    const packs = getSupportedCompliancePacks();

    for (const countryCode of expected) {
      const pack = packs.find((entry) => entry.countryCode === countryCode);
      expect(pack, `${countryCode} pack missing`).toBeDefined();
      expect(pack?.allowManualRateCorrection).toBe(true);
      expect(pack?.jurisdictions.length).toBeGreaterThan(0);
      expect(pack?.providerPriority[0]).toBe('manual_override');
    }
  });

  it('resolves US state plus local default and Canada province rates', () => {
    const usCA = resolveJurisdictionalRate({ countryCode: 'US', regionCode: 'US-CA', includeUSLocalDefault: true });
    expect(usCA.source).toBe('jurisdiction_default');
    expect(usCA.rate).toBe(0.0925);

    const caQC = resolveJurisdictionalRate({ countryCode: 'CA', regionCode: 'CA-QC' });
    expect(caQC.source).toBe('jurisdiction_default');
    expect(caQC.rate).toBe(0.14975);
  });

  it('resolves GCC country defaults for newly added packs', () => {
    const om = resolveJurisdictionalRate({ countryCode: 'OM' });
    expect(om.source).toBe('country_default');
    expect(om.rate).toBe(0.05);

    const qa = resolveJurisdictionalRate({ countryCode: 'QA' });
    expect(qa.source).toBe('country_default');
    expect(qa.rate).toBe(0);

    const bh = resolveJurisdictionalRate({ countryCode: 'BH' });
    expect(bh.source).toBe('country_default');
    expect(bh.rate).toBe(0.1);

    const kw = resolveJurisdictionalRate({ countryCode: 'KW' });
    expect(kw.source).toBe('country_default');
    expect(kw.rate).toBe(0);
  });

  it('returns null for unknown country pack', () => {
    expect(getCompliancePack('ZZ')).toBeNull();
  });
});
