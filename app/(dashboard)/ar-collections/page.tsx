"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Clock3,
  Filter,
  Hourglass,
  ListOrdered,
  RefreshCw,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Snapshot = {
  rows: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    dueDate: string | null;
    daysOverdue: number;
    bucket: 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';
    outstandingAmount: number;
    followUpStatus: string | null;
    priorityScore: number;
    lastReminderSentAt: string | null;
    collectionRiskScore: number | null;
  }>;
  totals: {
    totalOutstanding: number;
    overdueInvoices: number;
    overdueAmount: number;
    remindersSentLast7Days: number;
  };
  buckets: Array<{ key: string; label: string; count: number; amount: number }>;
  workspace: { baseCurrency: string; countryCode: string };
  smtpReminderReady: boolean;
};

const statusOptions = [
  'UNTOUCHED',
  'REMINDER_SENT',
  'FOLLOWUP_SCHEDULED',
  'PROMISE_TO_PAY',
  'PROMISE_BROKEN',
  'DISPUTED',
  'ESCALATED',
] as const;

function useMoneyFormatter(currencyCode: string, localeTag: string) {
  return useMemo(() => {
    const safeCurrency = currencyCode.trim() || 'INR';
    try {
      return new Intl.NumberFormat(localeTag, {
        style: 'currency',
        currency: safeCurrency,
        maximumFractionDigits: 2,
      });
    } catch {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      });
    }
  }, [currencyCode, localeTag]);
}

export default function ArCollectionsPage() {
  const t = useTranslations('ArCollections');
  const locale = useLocale();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState('all');
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const currency = snapshot?.workspace.baseCurrency ?? 'INR';
  const money = useMoneyFormatter(currency, locale);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/ar-collections', { cache: 'no-store' });
      if (res.status === 403) {
        setLoadError(t('errors.forbidden'));
        setSnapshot(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as Snapshot;
      setSnapshot(data);
    } catch {
      setLoadError(t('errors.load_failed'));
      setSnapshot(null);
      toast.error(t('toast.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const runAutomation = async () => {
    const toastId = toast.loading(t('toast.automation_running'));
    try {
      const res = await fetch('/api/ar-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_REMINDERS' }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        processed?: number;
        emailsSent?: number;
        emailsFailed?: number;
        skippedNoClientEmail?: number;
        smtpConfigured?: boolean;
        blocked?: string;
        code?: string;
        error?: string;
      };

      if (res.status === 429) {
        toast.error(payload.error ?? t('toast.automation_rate_limited'), { id: toastId });
        return;
      }
      if (!res.ok) throw new Error('Failed');

      if (payload.blocked === 'SMTP_NOT_CONFIGURED') {
        toast.error(t('toast.automation_no_smtp'), { id: toastId });
        await loadSnapshot();
        return;
      }

      const sent = payload.emailsSent ?? payload.processed ?? 0;
      const failed = payload.emailsFailed ?? 0;
      const skipped = payload.skippedNoClientEmail ?? 0;
      if (failed > 0 || skipped > 0) {
        toast.warning(
          `${t('toast.automation_done', { count: sent })} (${failed} failed, ${skipped} skipped)`,
          { id: toastId },
        );
      } else {
        toast.success(t('toast.automation_done', { count: sent }), { id: toastId });
      }
      await loadSnapshot();
    } catch {
      toast.error(t('toast.automation_failed'), { id: toastId });
    }
  };

  const filteredRows = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.rows.filter((row) => {
      const bySearch = `${row.invoiceNumber} ${row.clientName}`.toLowerCase().includes(search.toLowerCase());
      const byBucket = bucketFilter === 'all' || row.bucket === bucketFilter;
      return bySearch && byBucket;
    });
  }, [snapshot, search, bucketFilter]);

  const priorityQueue = filteredRows.filter((r) => r.daysOverdue > 0).slice(0, 8);

  const updateFollowUpStatus = async (invoiceId: string, nextStatus: string) => {
    setSavingRowId(invoiceId);
    try {
      const res = await fetch(`/api/ar-collections/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpStatus: nextStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setSnapshot((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) =>
                row.id === invoiceId ? { ...row, followUpStatus: nextStatus } : row,
              ),
            }
          : current,
      );
      toast.success(t('toast.followup_updated'));
    } catch {
      toast.error(t('toast.followup_failed'));
    } finally {
      setSavingRowId(null);
    }
  };

  const updateRiskScore = async (invoiceId: string, raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || Number.isNaN(n)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    setSavingRowId(invoiceId);
    try {
      const res = await fetch(`/api/ar-collections/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionRiskScore: clamped }),
      });
      if (!res.ok) throw new Error('Failed');
      setSnapshot((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) =>
                row.id === invoiceId ? { ...row, collectionRiskScore: clamped } : row,
              ),
            }
          : current,
      );
      toast.success(t('toast.risk_updated'));
    } catch {
      toast.error(t('toast.risk_failed'));
    } finally {
      setSavingRowId(null);
    }
  };

  const sendReminderNow = async (invoiceId: string) => {
    setSavingRowId(invoiceId);
    try {
      const res = await fetch(`/api/ar-collections/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendReminderNow: true, followUpStatus: 'REMINDER_SENT' }),
      });
      const errBody = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        toast.error(errBody.error ?? t('toast.reminder_failed'));
        return;
      }
      toast.success(t('toast.reminder_sent'));
      await loadSnapshot();
    } catch {
      toast.error(t('toast.reminder_failed'));
    } finally {
      setSavingRowId(null);
    }
  };

  const showKpiSkeleton = loading && !snapshot;

  return (
    <DashboardPageShell title={t('title')} description={t('description')}>
      <div className="space-y-6">
        {snapshot && !snapshot.smtpReminderReady ? (
          <div
            role="status"
            className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm flex gap-3 items-start"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{t('smtp_banner.title')}</p>
              <p className="text-zinc-600 dark:text-zinc-400 mt-1">{t('smtp_banner.body')}</p>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm flex flex-wrap items-center gap-3 justify-between"
          >
            <span className="text-red-800 dark:text-red-200">{loadError}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadSnapshot()}>
              {t('error_panel.retry')}
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard
            icon={Hourglass}
            label={t('kpi.total_outstanding')}
            value={showKpiSkeleton ? '—' : money.format(snapshot?.totals.totalOutstanding ?? 0)}
          />
          <KpiCard
            icon={AlertCircle}
            label={t('kpi.overdue_invoices')}
            value={showKpiSkeleton ? '—' : String(snapshot?.totals.overdueInvoices ?? 0)}
          />
          <KpiCard
            icon={Clock3}
            label={t('kpi.overdue_amount')}
            value={showKpiSkeleton ? '—' : money.format(snapshot?.totals.overdueAmount ?? 0)}
          />
          <KpiCard
            icon={BellRing}
            label={t('kpi.reminders_7d')}
            value={showKpiSkeleton ? '—' : String(snapshot?.totals.remindersSentLast7Days ?? 0)}
          />
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('buckets.title')}</CardTitle>
            <CardDescription>{t('buckets.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            {(snapshot?.buckets ?? []).map((bucket) => (
              <div
                key={bucket.key}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3"
              >
                <p className="text-xs text-zinc-500">{bucket.label}</p>
                <p className="mt-1 text-lg font-bold">{money.format(bucket.amount)}</p>
                <p className="text-xs text-zinc-500">
                  {t('buckets.invoice_count', { count: bucket.count })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{t('table.title')}</CardTitle>
                  <CardDescription>{t('table.subtitle')}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('table.search_placeholder')}
                    className="h-9 w-52 min-w-[8rem]"
                  />
                  <Select value={bucketFilter} onValueChange={setBucketFilter}>
                    <SelectTrigger className="h-9 w-44">
                      <Filter className="mr-2 h-3.5 w-3.5" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filters.all')}</SelectItem>
                      <SelectItem value="current">{t('filters.current')}</SelectItem>
                      <SelectItem value="d1_30">{t('filters.d1_30')}</SelectItem>
                      <SelectItem value="d31_60">{t('filters.d31_60')}</SelectItem>
                      <SelectItem value="d61_90">{t('filters.d61_90')}</SelectItem>
                      <SelectItem value="d90_plus">{t('filters.d90_plus')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => void loadSnapshot()}
                    disabled={loading}
                    aria-label={t('actions.refresh_aria')}
                  >
                    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.invoice')}</TableHead>
                    <TableHead>{t('columns.client')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.outstanding')}</TableHead>
                    <TableHead>{t('columns.priority')}</TableHead>
                    <TableHead>{t('columns.risk')}</TableHead>
                    <TableHead>{t('columns.followup')}</TableHead>
                    <TableHead className="text-right">{t('columns.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && snapshot && !loadError && filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-sm text-zinc-500">
                        {t('table.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>
                        {row.daysOverdue > 0
                          ? t('aging.days_overdue', { days: row.daysOverdue })
                          : t('aging.current')}
                      </TableCell>
                      <TableCell>{money.format(row.outstandingAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={row.priorityScore >= 70 ? 'destructive' : 'secondary'}>
                          {row.priorityScore}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[5.5rem]">
                        <Input
                          key={`${row.id}-${row.collectionRiskScore ?? 'null'}`}
                          className="h-8"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={row.collectionRiskScore ?? ''}
                          disabled={savingRowId === row.id}
                          onBlur={(e) => {
                            const next = e.target.value;
                            const prev =
                              row.collectionRiskScore === null || row.collectionRiskScore === undefined
                                ? ''
                                : String(row.collectionRiskScore);
                            if (next === prev) return;
                            void updateRiskScore(row.id, next);
                          }}
                          aria-label={t('columns.risk_aria')}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.followUpStatus ?? 'UNTOUCHED'}
                          onValueChange={(value) => void updateFollowUpStatus(row.id, value)}
                          disabled={savingRowId === row.id}
                        >
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt.replaceAll('_', ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => void sendReminderNow(row.id)}
                          disabled={savingRowId === row.id || !snapshot?.smtpReminderReady}
                        >
                          {t('actions.send_reminder')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListOrdered className="h-4 w-4" />
                {t('queue.title')}
              </CardTitle>
              <CardDescription>{t('queue.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {priorityQueue.map((row, index) => (
                <div key={row.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      #{index + 1} {row.clientName}
                    </p>
                    <Badge variant="outline">{row.priorityScore}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {row.invoiceNumber} • {t('queue.days', { days: row.daysOverdue })}
                  </p>
                  <p className="text-sm font-bold mt-1">{money.format(row.outstandingAmount)}</p>
                </div>
              ))}
              <Button className="w-full mt-2" type="button" onClick={() => void runAutomation()}>
                {t('actions.run_automation')}
              </Button>
              <p className="text-[11px] text-zinc-500 text-center">{t('automation.disclaimer')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardPageShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof AlertCircle;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-orange-500/10 p-2 text-orange-600 dark:text-orange-400">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-bold leading-none mt-1">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
