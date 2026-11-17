import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { assertNoTraversal, buildPrivatePath } from '@/lib/uploads/private-storage';

describe('private-upload path boundary', () => {
  it('preserves legitimate workspace and invoice filenames', () => {
    expect(() => assertNoTraversal(['ws_123', 'INV_26-27_001.pdf'])).not.toThrow();
    expect(buildPrivatePath('invoices', ['ws_123', 'INV_26-27_001.pdf']))
      .toBe(path.join(process.env.PRIVATE_UPLOADS_DIR || path.join(process.cwd(), 'private_uploads'), 'invoices', 'ws_123', 'INV_26-27_001.pdf'));
  });
  it.each(['', '.', '..', '../x', 'x/../y', 'a/b', 'a\\b', 'x\0y', 'x\ny', 'x\ry'])('rejects an unsafe path segment %j', (segment) => {
    expect(() => assertNoTraversal(['ws_123', segment])).toThrow('PATH_TRAVERSAL');
    expect(() => buildPrivatePath('documents', ['ws_123', segment])).toThrow('PATH_TRAVERSAL');
  });
});
