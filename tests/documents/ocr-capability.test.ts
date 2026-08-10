import { describe, expect, it, vi } from 'vitest';
import {
  buildOcrEnqueuePlan,
  resolveOcrCapability,
  toOcrCapabilityResponse,
  type OcrProvider,
} from '@/lib/documents/ocr/providers';

const registeredProvider: OcrProvider = {
  key: 'TEST_PROVIDER',
  run: vi.fn(async () => ({ rawText: 'ok', fields: [] })),
};

describe('document OCR capability strategy', () => {
  it('fails closed and creates no enqueue plan when no provider is configured', () => {
    const capability = resolveOcrCapability();

    expect(toOcrCapabilityResponse(capability)).toEqual({
      enabled: false,
      code: 'OCR_CAPABILITY_DISABLED',
      message: 'Document OCR is disabled because no production provider is configured.',
    });
    expect(buildOcrEnqueuePlan(capability, 'GENERIC')).toBeNull();
  });

  it('does not trust an environment provider key unless code registered the provider', () => {
    const capability = resolveOcrCapability({
      providerKey: 'ARBITRARY_ENV_VALUE',
      providers: new Map(),
    });

    expect(capability.enabled).toBe(false);
    expect(buildOcrEnqueuePlan(capability, 'RECEIPT')).toBeNull();
  });

  it('enqueues only the exact provider object selected from the registry', () => {
    const capability = resolveOcrCapability({
      providerKey: registeredProvider.key,
      providers: new Map([[registeredProvider.key, registeredProvider]]),
    });

    expect(capability.enabled).toBe(true);
    expect(toOcrCapabilityResponse(capability)).toEqual({
      enabled: true,
      provider: 'TEST_PROVIDER',
    });
    expect(buildOcrEnqueuePlan(capability, 'INVOICE')).toEqual({
      kind: 'INVOICE',
      status: 'QUEUED',
      provider: 'TEST_PROVIDER',
    });
  });
});
