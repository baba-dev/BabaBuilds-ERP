import { NextRequest, NextResponse } from 'next/server';
import { PayComponentCategory, PayrollInputMode } from '@prisma/client';

import {
  getPayrollSettingsSnapshot,
  replacePayComponents,
  toStandaloneConfig,
  toWorkforceLinkedConfig,
  updatePayrollSettings,
} from '@/lib/payroll/settings';
import { requirePayrollSettingsAccess } from '../_shared';

function isCategory(value: unknown): value is PayComponentCategory {
  return typeof value === 'string' && Object.values(PayComponentCategory).includes(value as PayComponentCategory);
}

function isInputMode(value: unknown): value is PayrollInputMode {
  return typeof value === 'string' && Object.values(PayrollInputMode).includes(value as PayrollInputMode);
}

export async function GET() {
  try {
    const { access, response } = await requirePayrollSettingsAccess('payroll.view');
    if (response || !access) return response!;

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[payroll/settings/components][GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { access, response } = await requirePayrollSettingsAccess('payroll.settings.manage');
    if (response || !access) return response!;

    const body = (await req.json()) as {
      inputMode?: PayrollInputMode;
      standaloneConfig?: unknown;
      workforceLinkedConfig?: unknown;
      components?: Array<{
        name?: string;
        code?: string;
        category?: PayComponentCategory;
        isTaxable?: boolean;
        isActive?: boolean;
        metadata?: Record<string, unknown>;
      }>;
    };

    if (body.inputMode && !isInputMode(body.inputMode)) {
      return NextResponse.json({ error: 'Invalid input mode' }, { status: 400 });
    }

    if (body.components) {
      for (const component of body.components) {
        if (!component.name?.trim() || !component.code?.trim() || !isCategory(component.category)) {
          return NextResponse.json(
            { error: 'Each component requires name, code, and valid category' },
            { status: 400 },
          );
        }
      }

      await replacePayComponents(
        access.workspaceId,
        body.components.map((component) => ({
          name: component.name!,
          code: component.code!,
          category: component.category!,
          isTaxable: component.isTaxable,
          isActive: component.isActive,
          metadata: component.metadata,
        })),
      );
    }

    await updatePayrollSettings(access.workspaceId, {
      ...(body.inputMode ? { inputMode: body.inputMode } : {}),
      ...(body.standaloneConfig ? { standaloneConfig: toStandaloneConfig(body.standaloneConfig) } : {}),
      ...(body.workforceLinkedConfig
        ? { workforceLinkedConfig: toWorkforceLinkedConfig(body.workforceLinkedConfig) }
        : {}),
    });

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[payroll/settings/components][PATCH]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
