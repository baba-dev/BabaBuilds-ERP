import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('share target route boundary', () => {
  it('enforces module, permission and rate limit before reading multipart input', () => {
    const source = fs.readFileSync('app/share-target/route.ts', 'utf8');
    const parseAt = source.indexOf('await request.formData()');
    expect(parseAt).toBeGreaterThan(0);
    for (const guard of [
      "requireModule(workspaceId, 'DOCUMENTS')",
      "requirePermission(userId, workspaceId, 'documents.upload')",
      "enforceRouteRateLimit({",
    ]) {
      const guardAt = source.indexOf(guard);
      expect(guardAt).toBeGreaterThan(0);
      expect(guardAt).toBeLessThan(parseAt);
    }
  });
});
