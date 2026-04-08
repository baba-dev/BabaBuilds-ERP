import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTax } from './engine';

test('India taxable income above slab threshold uses slab-based effective rate', () => {
  const result = estimateTax({
    countryCode: 'IN',
    revenue: '1000000',
    deductions: '0',
  });

  assert.equal(result.basis.method, 'rule_engine');
  assert.equal(result.disclaimerKey, 'AUTO_RULE');
  assert.equal(result.amount, '60000.00');
  assert.equal(result.ratePercent, 6);
});

test('Unknown country falls back to provider/fallback rate', () => {
  const result = estimateTax({
    countryCode: 'ZZ',
    revenue: '1000000',
    deductions: '0',
  });

  assert.equal(result.basis.method, 'fallback');
  assert.equal(result.disclaimerKey, 'FALLBACK_RULE');
  assert.equal(result.ratePercent, 30);
  assert.equal(result.amount, '300000.00');
});

test('Manual override supersedes rule-engine and fallback/provider resolution', () => {
  const result = estimateTax({
    countryCode: 'IN',
    revenue: '1000000',
    deductions: '0',
    overrideRatePercent: 22,
    overrideReason: 'Contract-specific treatment',
  });

  assert.equal(result.basis.method, 'manual_override');
  assert.equal(result.disclaimerKey, 'MANUAL_OVERRIDE');
  assert.equal(result.ratePercent, 22);
  assert.equal(result.amount, '220000.00');
  assert.equal(result.override.applied, true);
});
