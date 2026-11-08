import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canExecuteToolForRole,
  getToolPermissionRequirements,
  isMutatingTool,
  parseToolArguments,
  TOOL_NAMES,
} from '@/lib/ai/chat/tool-policy';
import {
  createToolConfirmationToken,
  verifyToolConfirmationToken,
} from '@/lib/ai/chat/tool-confirmation';

describe('AI chat tool policy', () => {
  it('fails closed when the role or tool is unavailable', () => {
    expect(
      canExecuteToolForRole(
        'lookup_invoice_details',
        undefined,
        { invoice_number: 'INV-1' },
      ),
    ).toBe(false);
    expect(canExecuteToolForRole('unknown_tool', 'OWNER', {})).toBe(false);
  });

  it('keeps Accountant read-only for finance mutations', () => {
    expect(
      canExecuteToolForRole(
        'lookup_invoice_details',
        'ACCOUNTANT',
        { invoice_number: 'INV-1' },
      ),
    ).toBe(true);
    expect(
      canExecuteToolForRole(
        'mark_invoice_paid',
        'ACCOUNTANT',
        { invoice_number: 'INV-1' },
      ),
    ).toBe(false);
    expect(
      canExecuteToolForRole(
        'auto_reconcile',
        'ACCOUNTANT',
        { transactionId: 'txn-1', invoiceNumber: 'INV-1' },
      ),
    ).toBe(false);
  });

  it('maps every advertised tool to canonical permissions', () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
    for (const toolName of TOOL_NAMES) {
      if (toolName === 'ui_navigate') {
        expect(
          getToolPermissionRequirements(toolName, { path: '/income' }),
        ).toEqual(['invoices.view']);
        continue;
      }

      const source = readFileSync(
        resolve(process.cwd(), 'lib/ai/chat/tool-policy.ts'),
        'utf8',
      );
      expect(source).toContain(`${toolName}:`);
    }
  });

  it('rejects unrestricted routes, payloads, and extra mutation fields', () => {
    expect(() =>
      parseToolArguments('ui_navigate', {
        path: 'https://attacker.invalid',
        payload: { code: 'alert(1)' },
      }),
    ).toThrow();
    expect(() =>
      parseToolArguments('ui_navigate', {
        path: '/clients',
        payload: { amount: 1 },
      }),
    ).toThrow();
    expect(() =>
      parseToolArguments('mark_invoice_paid', {
        invoice_number: 'INV-1',
        route: '/api/admin',
      }),
    ).toThrow();
    expect(() =>
      parseToolArguments('open_reporting_center', {
        presetId: '../../../admin',
        filters: {},
      }),
    ).toThrow();
  });

  it('classifies every server-side mutation for confirmation', () => {
    const expected = [
      'create_task',
      'mark_invoice_paid',
      'send_invoice_reminder',
      'create_client',
      'update_client_status',
      'log_expense',
      'auto_reconcile',
      'update_proposal_status',
      'convert_to_invoice',
      'add_service_to_catalog',
      'create_retainer',
      'update_retainer_status',
      'log_investment',
      'set_shop_status',
      'update_shop_announcement',
    ];
    expect(TOOL_NAMES.filter(isMutatingTool)).toEqual(expected);
  });

  it('keeps fresh RBAC and confirmation ahead of mutation execution', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/api/chat/route.ts'),
      'utf8',
    );
    expect(route).not.toContain('canExecuteToolForRole');
    expect(route).toContain('verifyToolConfirmationToken');
    expect(route).toContain('await requirePermission(');
    expect(route).toContain('ai_tool_mutation_before');
    expect(route).toContain('ai_tool_mutation_after');
    expect(route).toContain('aiToolConfirmationNonce.updateMany');
    expect(route).toContain('nonceClaim.count !== 1');

    const permissionIndex = route.indexOf(
      'await requirePermission(input.actorUserId, input.workspaceId, permission)',
    );
    const executionIndex = route.indexOf(
      'await executeMutationTool(input.toolName, input.args, input.workspaceId, input.actorUserId ?? null)',
    );
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(executionIndex).toBeGreaterThan(permissionIndex);
  });
});

describe('AI mutation confirmation token', () => {
  beforeEach(() => {
    vi.stubEnv(
      'AI_TOOL_CONFIRMATION_SECRET',
      'test-only-confirmation-secret-with-at-least-32-bytes',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is signed, short-lived, and bound to normalized mutation arguments', () => {
    const now = new Date('2026-08-10T10:00:00.000Z');
    const issued = createToolConfirmationToken({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      toolName: 'mark_invoice_paid',
      args: { invoice_number: 'INV-100' },
      now,
    });

    const payload = verifyToolConfirmationToken(
      issued.token,
      new Date(now.getTime() + 60_000),
    );
    expect(payload).toMatchObject({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      toolName: 'mark_invoice_paid',
      args: { invoice_number: 'INV-100' },
    });
    expect(payload.expiresAt - payload.issuedAt).toBe(120);
  });

  it('rejects tampering and expiry', () => {
    const now = new Date('2026-08-10T10:00:00.000Z');
    const issued = createToolConfirmationToken({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      toolName: 'auto_reconcile',
      args: { transactionId: 'txn-1', invoiceNumber: 'INV-1' },
      now,
    });
    const last = issued.token.at(-1);
    const tampered = `${issued.token.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;

    expect(() =>
      verifyToolConfirmationToken(tampered, new Date(now.getTime() + 10_000)),
    ).toThrow(/signature/i);
    expect(() =>
      verifyToolConfirmationToken(issued.token, new Date(now.getTime() + 121_000)),
    ).toThrow(/expired/i);
  });

  it('refuses tokens when the server secret is unavailable', () => {
    vi.stubEnv('AI_TOOL_CONFIRMATION_SECRET', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');

    expect(() =>
      createToolConfirmationToken({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        toolName: 'mark_invoice_paid',
        args: { invoice_number: 'INV-1' },
      }),
    ).toThrow(/signing secret/i);
  });
});
