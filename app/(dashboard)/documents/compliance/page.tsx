import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { getWorkspaceQuotaSnapshot } from '@/lib/documents/quota';
import { buildChecklist } from '@/lib/documents/compliance-checklist';
import { DocumentsShell } from '@/components/documents/DocumentsShell';
import { StorageMeter } from '@/components/documents/StorageMeter';

export default async function DocumentsCompliancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/documents/compliance');
  const workspaceId = (await resolveSessionMembership(session))?.workspaceId ?? null;
  if (!workspaceId) redirect('/dashboard');

  const t = await getTranslations('DocumentsHub');
  const canView = await checkPermissionSilent(session.user.id, workspaceId, 'documents.compliance.view');

  if (!canView) {
    return <DocumentsShell><p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t('compliance.noAccess')}</p></DocumentsShell>;
  }

  const [quota, workspace, docs] = await Promise.all([
    getWorkspaceQuotaSnapshot(workspaceId),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true, businessProfile: { select: { gstin: true, udyamNumber: true } } } }),
    prisma.document.findMany({ where: { workspaceId, isArchived: false, category: { in: ['BUSINESS_REGISTRATION', 'COMPLIANCE_DOCUMENT', 'TAX_FILING', 'BANK_STATEMENT'] } }, select: { id: true, title: true, category: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);
  const items = buildChecklist({ countryCode: workspace?.countryCode ?? 'IN', gstin: !!workspace?.businessProfile?.gstin, udyam: !!workspace?.businessProfile?.udyamNumber }, docs);
  const have = items.filter((i) => i.documents.length > 0).length;

  return (
    <DocumentsShell>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black">{t('compliance.title')}</h2>
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">{t('compliance.score', { have, total: items.length })}</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('compliance.intro')}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500" style={{ width: `${items.length ? (have / items.length) * 100 : 0}%` }} /></div>
          <ul className="mt-4 divide-y divide-border/70">
            {items.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center gap-3 py-3">
                {i.documents.length > 0 ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <CircleDashed className="h-5 w-5 shrink-0 text-amber-500" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(`req.${i.key}`)}</p>
                  {i.documents.length > 0 && <p className="truncate text-xs text-muted-foreground">{i.documents.slice(0, 3).map((d) => d.title).join(' · ')}</p>}
                </div>
                <span className={i.documents.length > 0 ? 'text-xs font-bold text-emerald-700 dark:text-emerald-400' : 'text-xs font-bold text-amber-700 dark:text-amber-400'}>{i.documents.length > 0 ? t('compliance.have') : t('compliance.missing')}</span>
                {i.documents.length === 0 && <Link href="/documents" className="text-xs font-semibold text-sky-600 hover:underline">{t('compliance.add')}</Link>}
              </li>
            ))}
          </ul>
        </section>
        <StorageMeter usedBytes={quota.bytesUsedTotal} capBytes={quota.bytesCapTotal} />
      </div>
    </DocumentsShell>
  );
}
