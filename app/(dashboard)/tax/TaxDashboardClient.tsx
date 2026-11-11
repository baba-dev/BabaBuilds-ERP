"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// MISSION CRITICAL: Globalization Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { PageLoadingState } from "@/components/states/PageLoadingState";
import { PageErrorState } from "@/components/states/PageErrorState";
import { ColumnVisibilityToggle, DataTable, DataTableToolbar, useUrlTableState, type DataTableColumnDef } from "@/components/data-table";
import { type TaxOverrideWindow } from "@/components/tax/tax-override-modal";
import { TaxComplianceOps } from "@/components/tax/tax-compliance-ops";
import { TaxHubOverview } from "@/components/tax/tax-hub-overview";
import { IncomeTaxPlanner } from "./_components/IncomeTaxPlanner";
import { TaxScopeNotice } from "@/components/tax/TaxScopeNotice";
import { getCountryPackVerificationStatus } from "@/lib/tax/country-pack-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTranslator } from "@/lib/i18n/translator";



const toSafeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type TaxDashboardClientProps = {
  taxAdvancedEnabled: boolean;
};

type InvestmentRow = {
  id: string;
  date: string;
  assetName: string;
  category: string;
  amount: number | string;
  [key: string]: unknown;
};

type TaxAuditRow = {
  id: string;
  createdAt: string;
  actorEmail?: string | null;
  actorUserId?: string | null;
  action: string;
  decisionSource: string;
  scopeType: string;
  scopeRef?: string | null;
  rate?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  reason?: string | null;
};

export default function TaxDashboardClient({ taxAdvancedEnabled }: TaxDashboardClientProps) {
  const t = useTranslations("Tax");
  const tr = createTranslator(t);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taxAuditRows, setTaxAuditRows] = useState<TaxAuditRow[]>([]);
  const [taxAuditPage, setTaxAuditPage] = useState(1);
  const [taxAuditTotalPages, setTaxAuditTotalPages] = useState(1);
  const [taxAuditFilters, setTaxAuditFilters] = useState({
    startDate: "",
    endDate: "",
    action: "ALL",
    scopeType: "ALL",
  });

  // --- GLOBALIZATION ENGINE ---
  const { 
    fCurrency, 
    currency, 
    locale, 
    dateFormat = "dd/MM/yyyy",
    countryCode = "IN",
    taxLabel = "Tax"
  } = useFormat();
  
  const currencySymbol = getCurrencySymbol(currency, locale);
  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, 'd').replace(/Y/g, 'y');
  const taxScopeStatus = getCountryPackVerificationStatus(countryCode);

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState("");
  const [assetName, setAssetName] = useState("");
  const [amount, setAmount] = useState("");

  const [] = useState<TaxOverrideWindow[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["date", "asset", "category", "amount"]);
  const tableState = useUrlTableState("tax");

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
  }, []);



  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;
        
        if (isFresh && data && path === '/tax') {
          if (data.category) setCategory(data.category);
          if (data.assetName || data.title) setAssetName(data.assetName || data.title);
          if (data.amount) setAmount(data.amount.toString());
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch { 
        console.error("Failed to parse AI payload"); 
        toast.warning("AI auto-fill failed. Please fill the form manually.");
      }
    }
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const invRes = await fetch('/api/investments');
      const invData = await invRes.json();
      const nextInvestments = Array.isArray(invData) ? invData : [];

      const revRes = await fetch('/api/finance/summary');
      const revData = await revRes.json();
      const nextRevenue = toSafeNumber(revData?.data?.totalRevenue);
      setInvestments(nextInvestments);
      setTotalRevenue(nextRevenue);
      if (taxAdvancedEnabled) {
        await fetchTaxAuditLogs(1);
      } else {
        setTaxAuditRows([]);
        setTaxAuditPage(1);
        setTaxAuditTotalPages(1);
      }
    } catch {
      console.error("Failed to load data");
      setFetchError("Failed to load tax planner data. Please refresh.");
      toast.error("Failed to load tax planner data. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!taxAdvancedEnabled) {
      return;
    }
    void fetchTaxAuditLogs(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
  }, [taxAdvancedEnabled]);

  const fetchTaxAuditLogs = async (page = 1, filters = taxAuditFilters) => {
    const searchParams = new URLSearchParams({
      page: String(page),
      pageSize: "10",
      action: filters.action,
      scopeType: filters.scopeType,
    });
    if (filters.startDate) searchParams.set("startDate", filters.startDate);
    if (filters.endDate) searchParams.set("endDate", filters.endDate);

    const res = await fetch(`/api/tax/audit?${searchParams.toString()}`);
    if (!res.ok) {
      throw new Error("Failed to fetch tax audit history");
    }
    const payload = await res.json();
    setTaxAuditRows(Array.isArray(payload?.data) ? payload.data : []);
    setTaxAuditPage(payload?.pagination?.page ?? 1);
    setTaxAuditTotalPages(payload?.pagination?.totalPages ?? 1);
  };

  const resolveDecisionBadgeClass = (source: string) => {
    const normalized = source?.toUpperCase();
    if (normalized === "OVERRIDE") return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    if (normalized === "AUTO") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  };

  // --- WEALTH CALCULATIONS (Global) ---
  const totalNetWorth = investments.reduce((sum, inv) => sum + toSafeNumber(inv?.amount), 0);
  
  const filteredInvestments = investments.filter((inv) =>
    `${inv.assetName} ${inv.category}`.toLowerCase().includes(tableState.search.toLowerCase()),
  );
  const columns: DataTableColumnDef<InvestmentRow>[] = [
    { id: "date", header: t("col_date"), sortable: true, sortAccessor: (row) => new Date(row.date).getTime(), cell: (row) => <span className="text-xs font-medium dark:text-zinc-300">{format(new Date(row.date), safeDateFormat)}</span>, hideable: true },
    { id: "asset", header: t("col_asset"), sortable: true, accessor: (row) => row.assetName, cell: (row) => <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{row.assetName}</span>, hideable: true },
    {
      id: "category",
      header: t("col_category"),
      accessor: (row) => row.category,
      cell: (row) => (
        <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded-md font-bold ${
          row.category.includes("Tax-deductible") ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
          row.category.includes("Insurance") ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
          row.category.includes("Gold") ? "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50" :
          "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
        }`}>
          {row.category}
        </span>
      ),
      hideable: true,
    },
    { id: "amount", header: t("col_amount", { currency }), headerClassName: "text-right", className: "text-right font-bold text-sm text-indigo-700 dark:text-indigo-400", sortable: true, sortAccessor: (row) => row.amount, cell: (row) => fCurrency(row.amount), hideable: true },
  ];

  if (isLoading) {
    return (
      <DashboardPageShell title={tr("title", "Savings & Tax")} description={tr("description", "Plan your {taxLabel} and savings.", { taxLabel })} animated={false}>
        <PageLoadingState title={tr("loading", "Loading")} description="Crunching your wealth and tax signals…" />
      </DashboardPageShell>
    );
  }

  if (fetchError && investments.length === 0 && totalRevenue === 0) {
    return (
      <DashboardPageShell title={tr("title", "Savings & Tax")} description={tr("description", "Plan your {taxLabel} and savings.", { taxLabel })} animated={false}>
        <PageErrorState
          title="Tax planner sync issue"
          description={fetchError}
          onRetry={fetchData}
        />
      </DashboardPageShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const toastId = toast.loading("Logging investment...");
    try {
      const res = await fetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, category, assetName, amount }),
      });
      if (res.ok) {
        setAssetName(""); setAmount(""); setCategory("");
        toast.success("Investment logged successfully.", { id: toastId });
        await fetchData();
      } else {
        toast.error("Failed to save investment. Please try again.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTaxAuditFilterChange = async (nextFilters: typeof taxAuditFilters) => {
    setTaxAuditFilters(nextFilters);
    try {
      await fetchTaxAuditLogs(1, nextFilters);
    } catch (err) {
      console.error(err);
      toast.error("Failed to refresh tax history.");
    }
  };

  return (
    <DashboardPageShell
      title={tr("title", "Savings & Tax")}
      description={tr("description", "Plan your {taxLabel} and savings.", { taxLabel })}
      animated={false}
    >
      <TaxScopeNotice status={taxScopeStatus} />
      <Tabs defaultValue={taxAdvancedEnabled ? "overview" : "planner"} className="w-full space-y-6">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-zinc-100/80 p-1 dark:bg-zinc-900/80">
          <TabsTrigger value="overview" className="text-xs font-semibold">
            Overview
          </TabsTrigger>
          <TabsTrigger value="planner" className="text-xs font-semibold">
            Savings & planner
          </TabsTrigger>
          {taxAdvancedEnabled && (
            <>
              <TabsTrigger value="compliance" className="text-xs font-semibold">
                Compliance & imports
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs font-semibold">
                Overrides & audit
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-0 outline-none">
          {taxAdvancedEnabled ? <TaxHubOverview /> : null}
        </TabsContent>

        <TabsContent value="planner" className="mt-0 space-y-6 outline-none">
        {/* TOP ROW: WEALTH & DEDUCTIONS */}
        <IncomeTaxPlanner investmentsTotal={totalNetWorth} />

        <Card className="shadow-sm border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-indigo-800 dark:text-indigo-400">{t('total_wealth')}</CardTitle>
            <Landmark className="h-4 w-4 text-indigo-600 dark:text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">{fCurrency(totalNetWorth)}</div>
            <p className="text-xs uppercase font-bold tracking-widest text-indigo-600 dark:text-indigo-400/80 mt-1">{t('total_wealth_desc')}</p>
          </CardContent>
        </Card>

        {/* BOTTOM ROW: FORM & LEDGER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <CardHeader className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-800 pb-6 rounded-t-xl">
                <CardTitle className="text-xl font-bold tracking-tight dark:text-zinc-50">{t('log_asset')}</CardTitle>
                <CardDescription className="dark:text-zinc-400 text-xs font-medium mt-1">{t('log_asset_desc')}</CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit} className="bg-zinc-50/50 dark:bg-zinc-950/50">
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('date')}</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark] font-bold text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('asset_class')}</Label>
                    <Select value={category} onValueChange={setCategory} required>
                      <SelectTrigger className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold text-xs">
                        <SelectValue placeholder={t('select_type')} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        <SelectItem value="Tax-deductible savings" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Tax-deductible savings</SelectItem>
                        <SelectItem value="Insurance contributions" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Insurance contributions</SelectItem>
                        <SelectItem value="Equity / Mutual Funds" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Equity / Mutual Funds</SelectItem>
                        <SelectItem value="Fixed Deposit (FD)" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Fixed Deposit (FD)</SelectItem>
                        <SelectItem value="Gold / Precious Metals" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Gold / Precious Metals</SelectItem>        
                        <SelectItem value="Cash / Savings Account" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Cash / Savings Account</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('description_label')}</Label>
                    <Input placeholder="e.g., Vanguard S&amp;P 500" value={assetName} onChange={(e) => setAssetName(e.target.value)} required className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('amount_label', { currency: currency })}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 dark:text-zinc-400 font-bold text-sm">{currencySymbol}</span>
                      <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1" className="pl-8 bg-white dark:bg-zinc-950 dark:border-zinc-800 font-bold dark:text-indigo-400 text-indigo-700" />
                    </div>
                  </div>
                </CardContent>
                <div className="p-4 bg-white dark:bg-zinc-900 border-t dark:border-zinc-800 rounded-b-xl">
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 text-xs font-bold uppercase tracking-widest" disabled={isSubmitting}>
                    {t('add_to_portfolio')}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-8">
             <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 h-full bg-white dark:bg-zinc-900">
              <CardHeader className="border-b border-zinc-200 dark:border-zinc-800">
                <CardTitle className="dark:text-zinc-50 text-sm font-bold uppercase tracking-wider">{t('asset_ledger')}</CardTitle>
                <CardDescription className="dark:text-zinc-400 text-xs font-medium">{t('ledger_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <DataTableToolbar
                  searchValue={tableState.search}
                  onSearchChange={tableState.setSearch}
                  searchPlaceholder={t("description_label")}
                  rightSlot={
                    <div className="hidden md:block">
                      <ColumnVisibilityToggle
                        options={columns.filter((col) => col.hideable).map((col) => ({
                          id: col.id,
                          label: typeof col.header === "string" ? col.header : col.id,
                          visible: visibleColumns.includes(col.id),
                          onToggle: () => setVisibleColumns((prev) => prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]),
                        }))}
                      />
                    </div>
                  }
                />
                <div className="hidden md:block">
                  <DataTable
                    columns={columns}
                    data={filteredInvestments}
                    rowId={(row) => row.id}
                    emptyTitle={t("no_assets")}
                    emptyDescription="Log your first investment to unlock deduction insights."
                    visibleColumnIds={visibleColumns}
                  />
                </div>
                <div className="space-y-3 p-3 pb-20 md:hidden">
                  {filteredInvestments.map((investment) => (
                    <Card key={investment.id} className="border-zinc-200 dark:border-zinc-800">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-zinc-500">{t("col_asset")}</p>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{investment.assetName}</p>
                          </div>
                          <p className="font-bold text-indigo-700 dark:text-indigo-400">{fCurrency(toSafeNumber(investment.amount))}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="max-w-[70%] truncate">{investment.category}</Badge>
                          <span className="text-xs text-zinc-500">{format(new Date(investment.date), safeDateFormat)}</span>
                        </div>
                        <details className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                          <summary className="cursor-pointer font-semibold">More details</summary>
                          <div className="space-y-1 pt-2 text-zinc-600 dark:text-zinc-300">
                            <p>{t("col_date")}: {format(new Date(investment.date), safeDateFormat)}</p>
                            <p>{t("col_category")}: {investment.category}</p>
                            <p>{t("col_amount", { currency })}: {fCurrency(toSafeNumber(investment.amount))}</p>
                          </div>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </TabsContent>

        {taxAdvancedEnabled && (
          <TabsContent value="compliance" className="mt-0 outline-none">
            <TaxComplianceOps />
          </TabsContent>
        )}

        {taxAdvancedEnabled && (
        <TabsContent value="audit" className="mt-0 outline-none">
        <Card className="mt-0 shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CardHeader className="border-b border-zinc-200 dark:border-zinc-800">
            <CardTitle className="dark:text-zinc-50 text-sm font-bold uppercase tracking-wider">Tax Decision History</CardTitle>
            <CardDescription className="dark:text-zinc-400 text-xs font-medium">
              Override and decision events with actor traceability.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                type="date"
                value={taxAuditFilters.startDate}
                onChange={(event) => handleTaxAuditFilterChange({ ...taxAuditFilters, startDate: event.target.value })}
                className="dark:[color-scheme:dark]"
              />
              <Input
                type="date"
                value={taxAuditFilters.endDate}
                onChange={(event) => handleTaxAuditFilterChange({ ...taxAuditFilters, endDate: event.target.value })}
                className="dark:[color-scheme:dark]"
              />
              <Select
                value={taxAuditFilters.action}
                onValueChange={(action) => handleTaxAuditFilterChange({ ...taxAuditFilters, action })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Action type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DEACTIVATE">Deactivate</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={taxAuditFilters.scopeType}
                onValueChange={(scopeType) => handleTaxAuditFilterChange({ ...taxAuditFilters, scopeType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scope type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All scopes</SelectItem>
                  <SelectItem value="WORKSPACE">Workspace</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="hidden overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Effective Range</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxAuditRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-zinc-500 py-8">
                        No tax decision history found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : taxAuditRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">{format(new Date(row.createdAt), `${safeDateFormat} HH:mm`)}</TableCell>
                      <TableCell className="text-xs">{row.actorEmail || row.actorUserId || "System"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px]">{row.action}</Badge>
                          <Badge className={`text-[11px] border-0 ${resolveDecisionBadgeClass(row.decisionSource)}`}>
                            {row.decisionSource}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{row.scopeType}{row.scopeRef ? ` • ${row.scopeRef}` : ""}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{typeof row.rate === "number" ? `${row.rate.toFixed(2)}%` : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {row.effectiveFrom ? format(new Date(row.effectiveFrom), safeDateFormat) : "—"}
                        {" → "}
                        {row.effectiveTo ? format(new Date(row.effectiveTo), safeDateFormat) : "Open"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate">{row.reason || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {taxAuditRows.length === 0 ? (
                <div className="rounded-md border border-zinc-200 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
                  No tax decision history found for the selected filters.
                </div>
              ) : (
                taxAuditRows.map((row) => (
                  <Card key={row.id} className="border-zinc-200 dark:border-zinc-800">
                    <CardContent className="space-y-2 p-4 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{format(new Date(row.createdAt), `${safeDateFormat} HH:mm`)}</p>
                        <Badge className={`text-[11px] border-0 ${resolveDecisionBadgeClass(row.decisionSource)}`}>{row.decisionSource}</Badge>
                      </div>
                      <p>{row.actorEmail || row.actorUserId || "System"} · {row.action}</p>
                      <p>{row.scopeType}{row.scopeRef ? ` • ${row.scopeRef}` : ""}</p>
                      <details className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                        <summary className="cursor-pointer font-semibold">More details</summary>
                        <div className="space-y-1 pt-2 text-zinc-600 dark:text-zinc-300">
                          <p>Rate: {typeof row.rate === "number" ? `${row.rate.toFixed(2)}%` : "—"}</p>
                          <p>From: {row.effectiveFrom ? format(new Date(row.effectiveFrom), safeDateFormat) : "—"}</p>
                          <p>To: {row.effectiveTo ? format(new Date(row.effectiveTo), safeDateFormat) : "Open"}</p>
                          <p>Reason: {row.reason || "—"}</p>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={taxAuditPage <= 1} onClick={() => fetchTaxAuditLogs(taxAuditPage - 1)}>
                Previous
              </Button>
              <span className="text-xs text-zinc-500">Page {taxAuditPage} of {taxAuditTotalPages}</span>
              <Button variant="outline" size="sm" disabled={taxAuditPage >= taxAuditTotalPages} onClick={() => fetchTaxAuditLogs(taxAuditPage + 1)}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
        </TabsContent>
        )}
      </Tabs>

    </DashboardPageShell>
  );
}
