import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productionOcrFiles = [
  'app/api/documents/upload/route.ts',
  'app/api/documents/ocr/run/route.ts',
  'app/api/cron/documents-ocr/route.ts',
  'lib/documents/ocr/providers.ts',
  'lib/documents/ocr/runner.ts',
  'lib/demo/templates/tax-agency.ts',
  'lib/demo/templates/dm-agency.ts',
  'lib/demo/templates/software-company.ts',
  'lib/demo/templates/contractor-builder.ts',
  'lib/demo/templates/freelancer-consultant.ts',
  'prisma/schema.prisma',
];

describe('document OCR production gate', () => {
  it.each(productionOcrFiles)('contains no unconfigured provider placeholder in %s', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(source).not.toContain(['UN', 'CONFIGURED'].join(''));
  });

  it('makes upload enqueue conditional on the resolved capability', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/documents/upload/route.ts'),
      'utf8',
    );

    expect(source).toContain('const ocrPlan = buildOcrEnqueuePlan(');
    expect(source).toContain('const ocrJob = ocrPlan');
    expect(source).toContain('capabilities: { ocr: ocrCapabilityResponse }');
  });

  it('makes both OCR execution endpoints return the disabled capability before running work', () => {
    for (const path of [
      'app/api/documents/ocr/run/route.ts',
      'app/api/cron/documents-ocr/route.ts',
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      const capabilityCheck = source.indexOf('if (!capability.enabled)');
      const runCall = source.indexOf('await runQueuedOcrJobs(');

      expect(capabilityCheck).toBeGreaterThan(-1);
      expect(runCall).toBeGreaterThan(capabilityCheck);
      expect(source).toContain("code: capability.code");
      expect(source).toContain('status: 503');
    }
  });
});
