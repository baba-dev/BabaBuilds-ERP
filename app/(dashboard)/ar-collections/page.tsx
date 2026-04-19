"use client";

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, Clock3, Filter, Hourglass, ListOrdered, RefreshCw } from 'lucide-react';
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
  }>;
  totals: {
    totalOutstanding: number;
    overdueInvoices: number;
    overdueAmount: number;
    remindersSentLast7Days: number;
  };
  buckets: Array<{ key: string; label: string; count: number; amount: number }>;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const statusOptions = [
  'UNTOUCHED',
  'REMINDER_SENT',
  'FOLLOWUP_SCHEDULED',
  'PROMISE_TO_PAY',
  'PROMISE_BROKEN',
  'DISPUTED',
  'ESCALATED',
] as const;

export default function ArCollectionsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState('all');
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const loadSnapshot = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ar-collections', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as Snapshot;
      setSnapshot(data);
    } catch {
      toast.error('Could not load AR Collections data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const runAutomation = async () => {
    const id = toast.loading('Running reminder automation...');
    try {
      const res = await fetch('/api/ar-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_REMINDERS' }),
      });
      const payload = (await res.json().catch(() => ({}))) as { processed?: number };
      if (!res.ok) throw new Error('Failed');
      toast.success(`Automation completed. ${payload.processed ?? 0} reminders queued.`, { id });
      await loadSnapshot();
    } catch {
      toast.error('Failed to run reminder automation.', { id });
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
              rows: current.rows.map((row) => (row.id === invoiceId ? { ...row, followUpStatus: nextStatus } : row)),
            }
          : current,
      );
      toast.success('Follow-up status updated.');
    } catch {
      toast.error('Could not update follow-up status.');
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
      if (!res.ok) throw new Error('Failed');
      toast.success('Reminder marked as sent.');
      await loadSnapshot();
    } catch {
      toast.error('Failed to send reminder.');
    } finally {
      setSavingRowId(null);
    }
  };

  return (
    <DashboardPageShell
      title="AR Aging + Collections Centre"
      description="Track aging buckets, prioritize collections, and automate reminders for overdue receivables."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard icon={Hourglass} label="Total Outstanding" value={money.format(snapshot?.totals.totalOutstanding ?? 0)} />
          <KpiCard icon={AlertCircle} label="Overdue Invoices" value={String(snapshot?.totals.overdueInvoices ?? 0)} />
          <KpiCard icon={Clock3} label="Overdue Amount" value={money.format(snapshot?.totals.overdueAmount ?? 0)} />
          <KpiCard icon={BellRing} label="Reminders (7d)" value={String(snapshot?.totals.remindersSentLast7Days ?? 0)} />
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aging Buckets</CardTitle>
            <CardDescription>Receivable distribution by overdue age.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            {(snapshot?.buckets ?? []).map((bucket) => (
              <div key={bucket.key} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3">
                <p className="text-xs text-zinc-500">{bucket.label}</p>
                <p className="mt-1 text-lg font-bold">{money.format(bucket.amount)}</p>
                <p className="text-xs text-zinc-500">{bucket.count} invoices</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Overdue List</CardTitle>
                  <CardDescription>Collectors can update follow-up state and send reminders instantly.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search client or invoice"
                    className="h-9 w-52"
                  />
                  <Select value={bucketFilter} onValueChange={setBucketFilter}>
                    <SelectTrigger className="h-9 w-36">
                      <Filter className="mr-2 h-3.5 w-3.5" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All buckets</SelectItem>
                      <SelectItem value="d1_30">1-30 days</SelectItem>
                      <SelectItem value="d31_60">31-60 days</SelectItem>
                      <SelectItem value="d61_90">61-90 days</SelectItem>
                      <SelectItem value="d90_plus">90+ days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => void loadSnapshot()} disabled={loading}>
                    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Overdue</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>{row.daysOverdue > 0 ? `${row.daysOverdue}d` : 'Current'}</TableCell>
                      <TableCell>{money.format(row.outstandingAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={row.priorityScore >= 70 ? 'destructive' : 'secondary'}>{row.priorityScore}</Badge>
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
                              <SelectItem key={opt} value={opt}>{opt.replaceAll('_', ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void sendReminderNow(row.id)}
                          disabled={savingRowId === row.id}
                        >
                          Send Reminder
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
              <CardTitle className="text-base flex items-center gap-2"><ListOrdered className="h-4 w-4" />Collection Priority Queue</CardTitle>
              <CardDescription>Top high-risk overdue accounts ordered by priority score.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {priorityQueue.map((row, index) => (
                <div key={row.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">#{index + 1} {row.clientName}</p>
                    <Badge variant="outline">{row.priorityScore}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{row.invoiceNumber} • {row.daysOverdue} days overdue</p>
                  <p className="text-sm font-bold mt-1">{money.format(row.outstandingAmount)}</p>
                </div>
              ))}
              <Button className="w-full mt-2" onClick={() => void runAutomation()}>
                Run Reminder Automation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardPageShell>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: typeof AlertCircle; label: string; value: string }) {
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
