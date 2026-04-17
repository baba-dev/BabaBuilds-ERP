"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";

type HubSummary = {
  gstSummary?: {
    financialYear: string;
    invoiceCount: number;
    taxableSupplyApprox: number;
    taxChargedApprox: number;
    topSacCodes: Array<{ sacCode: string; invoiceCount: number; taxAmount: number }>;
  };
  readiness: {
    hasReturns: boolean;
    totalOpenBlockers: number;
    openBlockersBySeverity: { INFO: number; WARNING: number; CRITICAL: number };
    nextReturn: {
      id: string;
      status: string;
      readinessScore: number;
      formCode: string;
      periodCode: string;
      dueDate: Date | string;
    } | null;
  };
  returnPeriods: Array<{
    id: string;
    periodKey: string;
    dueDate: string;
    filedAt: string | null;
    status: string;
  }>;
  obligations: Array<{
    id: string;
    periodKey: string;
    dueDate: string;
    status: string;
    taxType: string;
    jurisdictionCode: string;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    correlationId: string | null;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
    payload: unknown;
  }>;
};

export function TaxHubOverview() {
  const [data, setData] = useState<HubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileDates, setFileDates] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tax/hub/summary", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load tax hub");
      const json = (await res.json()) as HubSummary;
      setData(json);
    } catch {
      toast.error("Could not load tax overview.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markFiled = async (periodId: string) => {
    const filedAt = fileDates[periodId] || new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch(`/api/tax/return-periods/${periodId}/file`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filedAt: `${filedAt}T12:00:00.000Z` }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Mark filed failed");
      }
      toast.success("Return period marked as filed.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mark filed failed");
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-900"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-hidden />
        <span className="sr-only">Loading tax overview</span>
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-12 text-center text-sm text-zinc-500">Tax overview is unavailable.</CardContent>
      </Card>
    );
  }

  const crit = data.readiness.openBlockersBySeverity.CRITICAL;
  const warn = data.readiness.openBlockersBySeverity.WARNING;
  const healthOk = data.readiness.totalOpenBlockers === 0;

  return (
    <div className="space-y-6">
      {data.gstSummary && (
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">GSTR-1 style pilot (outward supplies)</CardTitle>
            <CardDescription>
              FY {data.gstSummary.financialYear} · aggregates from invoices in this workspace (SAC-grouped)
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">Invoices</p>
              <p className="text-2xl font-bold">{data.gstSummary.invoiceCount}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">Taxable supply (approx)</p>
              <p className="text-2xl font-bold">{data.gstSummary.taxableSupplyApprox.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">Tax charged (approx)</p>
              <p className="text-2xl font-bold">{data.gstSummary.taxChargedApprox.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="md:col-span-3">
              <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Top SAC groups by tax</p>
              <div className="flex flex-wrap gap-2">
                {data.gstSummary.topSacCodes.length === 0 ? (
                  <span className="text-sm text-zinc-500">No invoice data in FY window.</span>
                ) : (
                  data.gstSummary.topSacCodes.map((row) => (
                    <Badge key={row.sacCode} variant="secondary" className="font-mono text-[11px]">
                      {row.sacCode} · {row.invoiceCount} inv · tax {row.taxAmount.toFixed(0)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-indigo-600" aria-hidden />
              Readiness
            </CardTitle>
            <CardDescription>Open blockers and latest return</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={healthOk ? "default" : "destructive"}>{healthOk ? "Clear" : `${data.readiness.totalOpenBlockers} open`}</Badge>
              {crit > 0 && (
                <Badge variant="destructive">
                  {crit} critical
                </Badge>
              )}
              {warn > 0 && <Badge variant="secondary">{warn} warnings</Badge>}
            </div>
            {data.readiness.nextReturn ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Next: <span className="font-medium">{data.readiness.nextReturn.formCode}</span> ·{" "}
                {data.readiness.nextReturn.periodCode} · score {data.readiness.nextReturn.readinessScore}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">No return runs yet. Run readiness from a tax period when ready.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-amber-600" aria-hidden />
              Obligations
            </CardTitle>
            <CardDescription>Scheduled filings from workspace registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{data.obligations.length}</p>
            <p className="text-xs text-zinc-500">Showing next {Math.min(24, data.obligations.length)} in window</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              Return periods
            </CardTitle>
            <CardDescription>TDS / withholding period tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{data.returnPeriods.length}</p>
            <p className="text-xs text-zinc-500">File acknowledgments when deposits are done</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Upcoming obligations</CardTitle>
          <CardDescription>Requires active workspace tax registration and calendar rules</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.obligations.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              No obligations yet. Seed reference data and add a registration, then run the tax obligations cron.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.obligations.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      {o.taxType} <span className="text-zinc-500">({o.jurisdictionCode})</span>
                    </TableCell>
                    <TableCell className="text-xs">{o.periodKey}</TableCell>
                    <TableCell className="text-xs">{format(new Date(o.dueDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{o.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Return periods & filing</CardTitle>
          <CardDescription>Mark a period filed after you have acknowledgment (requires tax.file permission)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.returnPeriods.length === 0 ? (
            <p className="text-sm text-zinc-500">No return periods recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.returnPeriods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.periodKey}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.dueDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={p.filedAt ? "default" : "secondary"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!p.filedAt ? (
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`filed-${p.id}`} className="sr-only">
                              Filed date
                            </Label>
                            <Input
                              id={`filed-${p.id}`}
                              type="date"
                              className="h-8 w-[140px] text-xs"
                              value={fileDates[p.id] ?? new Date().toISOString().slice(0, 10)}
                              onChange={(e) => setFileDates((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            />
                          </div>
                          <Button size="sm" variant="outline" className="h-8 text-xs" type="button" onClick={() => void markFiled(p.id)}>
                            Mark filed
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">{format(new Date(p.filedAt), "dd MMM yyyy")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent tax activity</CardTitle>
          <CardDescription>Determinations, readiness runs, imports, and document links</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.auditEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No tax audit events yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.auditEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(e.createdAt), "dd MMM HH:mm")}</TableCell>
                    <TableCell className="text-xs font-medium">{e.eventType}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-zinc-500">
                      {e.entityType ?? "—"} {e.entityId ? `· ${e.entityId}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
