import { describe, expect, it } from 'vitest';
import { buildChecklist } from '@/lib/documents/compliance-checklist';

const doc = (id: string, title: string, category: string) => ({ id, title, category });

describe('buildChecklist', () => {
  it('expects PAN, GST and Udyam only when they apply', () => {
    const keys = (p: { countryCode: string; gstin: boolean; udyam: boolean }) => buildChecklist(p, []).map((i) => i.key);
    expect(keys({ countryCode: 'IN', gstin: true, udyam: true })).toEqual(['PAN', 'GST', 'UDYAM', 'REGISTRATION', 'BANK', 'FILING']);
    expect(keys({ countryCode: 'IN', gstin: false, udyam: false })).toEqual(['PAN', 'REGISTRATION', 'BANK', 'FILING']);
    expect(keys({ countryCode: 'US', gstin: false, udyam: false })).toEqual(['REGISTRATION', 'BANK', 'FILING']);
  });
  it('matches registration documents by title keyword and others by category', () => {
    const docs = [doc('1', 'PAN card - Acme', 'BUSINESS_REGISTRATION'), doc('2', 'GST certificate', 'COMPLIANCE_DOCUMENT'), doc('3', 'HDFC statement Oct', 'BANK_STATEMENT'), doc('4', 'Lunch receipt', 'EXPENSE_RECEIPT')];
    const list = buildChecklist({ countryCode: 'IN', gstin: true, udyam: false }, docs);
    const ids = (k: string) => list.find((i) => i.key === k)!.documents.map((d) => d.id);
    expect(ids('PAN')).toEqual(['1']);
    expect(ids('GST')).toEqual(['2']);
    expect(ids('BANK')).toEqual(['3']);
    expect(ids('FILING')).toEqual([]);
  });
});
