import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('CodeQL workflow security contract', () => {
  const source = fs.readFileSync('.github/workflows/codeql.yml', 'utf8');
  it('runs extended JavaScript and TypeScript security analysis on PRs and main', () => {
    expect(source).toMatch(/pull_request:/);
    expect(source).toMatch(/branches: \[main\]/);
    expect(source).toMatch(/languages: javascript-typescript/);
    expect(source).toMatch(/queries: security-extended/);
  });
  it('uses GitHub-hosted runners with narrowly scoped event-writing permission', () => {
    expect(source).toMatch(/runs-on: ubuntu-latest/);
    expect(source).not.toMatch(/runs-on: self-hosted/);
    expect(source).toMatch(/security-events: write/);
    expect(source).toMatch(/contents: read/);
  });
});
