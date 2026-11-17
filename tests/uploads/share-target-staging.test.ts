import { describe, expect, it } from 'vitest';
import { classifySharedContent, MAX_SHARED_FILE_COUNT, MAX_SHARED_STAGED_BYTES } from '@/lib/uploads/share-target-staging';

describe('shared file content classification', () => {
  it('preserves valid PDF, PNG, and JPEG inputs', () => {
    expect(classifySharedContent('application/pdf', 'pdf', 'Invoice.pdf')).toEqual({ mimeType: 'application/pdf', extension: '.pdf' });
    expect(classifySharedContent('image/png', 'png', 'logo.png')).toEqual({ mimeType: 'image/png', extension: '.png' });
    expect(classifySharedContent('image/jpeg', 'jpeg', 'photo.jpeg')).toEqual({ mimeType: 'image/jpeg', extension: '.jpeg' });
  });
  it('uses detected bytes instead of untrusted filename suffix', () => {
    expect(classifySharedContent('image/png', 'png', 'evil.html')).toEqual({ mimeType: 'image/png', extension: '.png' });
    expect(classifySharedContent('application/pdf', 'pdf', 'bad.exe')).toEqual({ mimeType: 'application/pdf', extension: '.pdf' });
  });
  it('rejects payloads inconsistent with the advertised content category', () => {
    expect(classifySharedContent('image/png', 'pdf', 'x.png')).toBeNull();
    expect(classifySharedContent('application/pdf', 'jpeg', 'x.pdf')).toBeNull();
    expect(classifySharedContent('image/svg+xml', null, 'x.svg')).toBeNull();
    expect(classifySharedContent('text/html', 'png', 'x.html')).toBeNull();
  });
  it('sets bounded aggregate and file counts', () => {
    expect(MAX_SHARED_FILE_COUNT).toBe(50);
    expect(MAX_SHARED_STAGED_BYTES).toBe(50 * 1024 * 1024);
  });
});
