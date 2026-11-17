import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('Phase 4 standalone worker guardrails', () => {
  const source = fs.readFileSync('ops/erp-worker/worker.mjs', 'utf8');
  it('is a different process from the Next.js API', () => {
    expect(source).toContain("import { Queue, Worker } from 'bullmq'");
    expect(source).not.toContain('next/server');
    expect(source).not.toContain('lib/redis/client');
  });
  it('uses transactional outbox lock and bounded idempotent delivery', () => {
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain("conn.query('COMMIT')");
    expect(source).toContain('jobId: row.id');
    expect(source).toContain('max: 2');
    expect(source).toContain('concurrency: 2');
  });
  it('never places task content, user email or secrets into Redis payloads', () => {
    expect(source).toContain("{ outboxId: row.id }");
    expect(source).not.toContain('{ task:');
  });
});
