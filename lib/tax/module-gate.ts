import { NextResponse } from 'next/server';
import { isModuleEnabled } from '@/lib/modules';

export async function taxAdvancedModuleDisabledResponse(workspaceId: string) {
  const enabled = await isModuleEnabled(workspaceId, 'TAX_ADVANCED');
  if (!enabled) {
    return NextResponse.json(
      { error: 'Tax advanced capabilities are disabled for this workspace.', code: 'MODULE_DISABLED' },
      { status: 403 },
    );
  }
  return null;
}
