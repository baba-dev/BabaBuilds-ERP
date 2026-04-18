import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { apiError } from '@/lib/api-error';
import { isTaxImportTemplateType, TAX_IMPORT_TEMPLATES, templateToCsv } from '@/lib/tax/import-templates';
import { taxAdvancedModuleDisabledResponse } from '@/lib/tax/module-gate';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');
  const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
  if (moduleDisabledResponse) return moduleDisabledResponse;

  try {
    await requirePermission(userId, workspaceId, 'tax.view');
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }

  const url = new URL(req.url);
  const template = url.searchParams.get('template');

  if (!isTaxImportTemplateType(template)) {
    return apiError(400, 'Invalid template type', 'INVALID_INPUT');
  }

  const def = TAX_IMPORT_TEMPLATES[template];
  const csv = templateToCsv(def);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tax-import-${template.toLowerCase()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
