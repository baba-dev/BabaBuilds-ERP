import { TaxStrategy } from './types';
import { IndiaTaxStrategy } from './india';
import { GenericTaxStrategy } from './generic';

const STRATEGIES: Record<string, TaxStrategy> = {
  'IN': new IndiaTaxStrategy(),
};

export function getTaxStrategy(countryCode: string): TaxStrategy {
  const code = countryCode.trim().toUpperCase();
  return STRATEGIES[code] || new GenericTaxStrategy(code);
}
