"use client";

import { useState, useReducer, useCallback } from "react";
import { useTranslations } from "next-intl";
import { 
  UploadCloud, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  ListChecks
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  segmentedControlContainerClass,
  segmentedControlItemActiveClass,
  segmentedControlItemClass,
} from "@/components/ui/segmented-control";
import { toast } from "sonner";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";

// We will build this in the next step!
import { ReconciliationRow } from "@/components/ReconciliationRow";
import { useFormat } from "@/hooks/use-format";
import { PageLoadingState } from "@/components/states/PageLoadingState";
import { PageErrorState } from "@/components/states/PageErrorState";
import { PageEmptyState } from "@/components/states/PageEmptyState";
import { DataTable, DataTableToolbar, useUrlTableState, type DataTableColumnDef } from "@/components/data-table";
import { cn } from "@/lib/utils";


// --- STATE MACHINE TYPES ---
export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  aiCategory?: string;
  aiVendor?: string;
  reason?: string;
  matchType?: string;
  matchId?: string;
};

type State = {
  autoMatched: Transaction[];
  pendingAi: Transaction[];
  approvedAi: Transaction[];
  ignored: Transaction[];
};

type Action = 
  | { type: 'SET_INITIAL_DATA'; payload: { auto: Transaction[], ai: Transaction[], ignored: Transaction[] } }
  | { type: 'APPROVE_ITEM'; payload: Transaction }
  | { type: 'IGNORE_ITEM'; payload: Transaction }
  | { type: 'RESTORE_ITEM'; payload: Transaction }
  | { type: 'BULK_APPROVE'; payload: { items: Transaction[] } }
  | { type: 'RESET_ALL' };

// --- REDUCER LOGIC ---
const initialState: State = {
  autoMatched: [],
  pendingAi: [],
  approvedAi: [],
  ignored: [],
};

function reconReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_INITIAL_DATA':
      return {
        autoMatched: action.payload.auto,
        pendingAi: action.payload.ai,
        approvedAi: [],
        ignored: action.payload.ignored,
      };
    case 'APPROVE_ITEM':
      return {
        ...state,
        pendingAi: state.pendingAi.filter(i => i.id !== action.payload.id),
        approvedAi: [action.payload, ...state.approvedAi] // Add to top of approved list
      };
    case 'IGNORE_ITEM':
      return {
        ...state,
        pendingAi: state.pendingAi.filter(i => i.id !== action.payload.id),
        approvedAi: state.approvedAi.filter(i => i.id !== action.payload.id),
        ignored: [action.payload, ...state.ignored]
      };
    case 'RESTORE_ITEM':
      // Move from Ignored back to Pending AI
      return {
        ...state,
        ignored: state.ignored.filter(i => i.id !== action.payload.id),
        pendingAi: [action.payload, ...state.pendingAi]
      };
    case 'BULK_APPROVE':
      const idsToApprove = new Set(action.payload.items.map(i => i.id));
      return {
        ...state,
        pendingAi: state.pendingAi.filter(i => !idsToApprove.has(i.id)),
        approvedAi: [...action.payload.items, ...state.approvedAi]
      };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}

export default function ReconciliationWizard() {
  const t = useTranslations('Reconciliation');
  const { fCurrency } = useFormat();
  const [state, dispatch] = useReducer(reconReducer, initialState);

  
  // UI States
  const [step, setStep] = useState<'upload' | 'wizard'>('upload');
  const [activeTab, setActiveTab] = useState<'auto' | 'ai' | 'ignored'>('auto');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const readyTableState = useUrlTableState("recon_ready");

  // --- UPLOAD HANDLER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsProcessing(true);
      setUploadError(null);
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/reconcile/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        dispatch({ 
          type: 'SET_INITIAL_DATA', 
          payload: { auto: data.autoMatched || [], ai: data.aiSuggestions || [], ignored: data.ignored || [] } 
        });
        
        toast.success(t('upload_success'));
        setStep('wizard');
        // Auto-switch to the AI tab if there are things to review
        if (data.aiSuggestions?.length > 0) setActiveTab('ai');

      } catch (err: any) {
        setUploadError(err.message || t('upload_error'));
        toast.error(err.message || t('upload_error'));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // --- SMART GROUPING & APPROVAL LOGIC ---
  const handleItemApprove = useCallback((updatedItem: Transaction) => {
    // 1. Dispatch the primary approval
    dispatch({ type: 'APPROVE_ITEM', payload: updatedItem });

    // 2. Look for similar items that are still pending
    if (updatedItem.aiVendor) {
      const vendorKeyword = updatedItem.aiVendor.toLowerCase();
      const similarPending = state.pendingAi.filter(item => 
        item.id !== updatedItem.id && 
        item.description.toLowerCase().includes(vendorKeyword)
      );

      if (similarPending.length > 0) {
        const autoUpdatedSimilar = similarPending.map(item => ({
          ...item,
          aiCategory: updatedItem.aiCategory,
          aiVendor: updatedItem.aiVendor,
          reason: t('auto_group_reason')
        }));

        toast(t('found_similar', { count: similarPending.length, vendor: updatedItem.aiVendor }), {
          icon: <Sparkles className="w-4 h-4 text-purple-500" />,
          action: {
            label: t('apply_all'),
            onClick: () => {
              dispatch({ type: 'BULK_APPROVE', payload: { items: autoUpdatedSimilar } });
              toast.success(t('categorized_success', { count: similarPending.length, category: updatedItem.aiCategory || 'Categorized' }));
            }
          },
          duration: 6000,
        });
      }
    }
  }, [state.pendingAi, t]);

  const handleItemIgnore = useCallback((item: Transaction) => {
    dispatch({ type: 'IGNORE_ITEM', payload: item });
    toast(t('transaction_ignored'), {
      action: {
        label: t('undo'),
        onClick: () => dispatch({ type: 'RESTORE_ITEM', payload: item })
      }
    });
  }, [t]);

  // --- FINALIZATION ---
  const totalReadyToCommit = state.autoMatched.length + state.approvedAi.length;
  const needsReviewCount = state.pendingAi.length;
  const readyRows = [...state.autoMatched, ...state.approvedAi].filter((row) =>
    `${row.description} ${row.aiCategory ?? ""} ${row.aiVendor ?? ""}`.toLowerCase().includes(readyTableState.search.toLowerCase()),
  );
  const readyColumns: DataTableColumnDef<Transaction>[] = [
    {
      id: "date_desc",
      header: t("col_date_desc"),
      sortable: true,
      sortAccessor: (row) => row.date,
      cell: (row) => (
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{row.date}</p>
          <p className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">{row.description}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: t("col_type"),
      cell: (row) =>
        row.matchType === "INVOICE" ? (
          <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-none hover:bg-blue-100 dark:hover:bg-blue-900/40">{t("invoice_match")}</Badge>
        ) : (
          <div className="flex gap-1">
            <Badge className="bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-none">{row.aiCategory}</Badge>
            <Badge variant="outline" className="text-zinc-600 dark:text-zinc-400 dark:border-zinc-700">{row.aiVendor}</Badge>
          </div>
        ),
    },
    {
      id: "amount",
      header: <div className="text-right">{t("col_amount")}</div>,
      className: "text-right font-bold",
      sortable: true,
      sortAccessor: (row) => row.amount,
      cell: (row) => <span className={row.type === "DEBIT" ? "text-rose-600" : "text-emerald-600"}>{row.type === "DEBIT" ? "-" : "+"} {fCurrency(row.amount)}</span>,
    },
    {
      id: "status",
      header: <div className="text-center">{t("col_status")}</div>,
      className: "text-center",
      cell: () => <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />,
    },
  ];

  const handleFinalizeClick = () => {
    if (totalReadyToCommit === 0) {
      toast.error(t('no_approval_error'));
      return;
    }
    if (needsReviewCount > 0) {
      toast.warning(t('review_warning', { count: needsReviewCount }));
    }
    setIsConfirmOpen(true);
  };

  const executeFinalize = async () => {
    setIsConfirmOpen(false);
    setIsFinalizing(true);
    const toastId = toast.loading(t('writing_ledger'));

    try {
      const allApproved = [...state.autoMatched, ...state.approvedAi];
      const invoicesToClear = allApproved.filter(item => item.matchType === 'INVOICE');
      const expensesToLog = allApproved.filter(item => item.aiCategory); 

      const res = await fetch('/api/reconcile/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedInvoices: invoicesToClear,
          approvedExpenses: expensesToLog
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(t('reconcile_success'), { id: toastId });
      
      setStep('upload');
      dispatch({ type: 'RESET_ALL' });

    } catch (err: any) {
      toast.error(err.message || t('save_error'), { id: toastId });
    } finally {
      setIsFinalizing(false);
    }
  };

  // --- RENDER VIEWS ---
  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 flex flex-col items-center justify-center animate-in fade-in duration-500 transition-colors duration-300">
        <div className="max-w-xl w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black text-zinc-900 dark:text-zinc-50">{t('upload_title')}</h1>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">{t('upload_desc')}</p>
          </div>

          <Card className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all duration-300 hover:border-purple-300 dark:hover:border-purple-900 shadow-none relative overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-20 px-4 text-center">
              {isProcessing ? (
                <PageLoadingState title={t('ai_classifying')} description={t('matching_desc')} className="min-h-[260px]" />
              ) : (
                <div className="space-y-4 flex flex-col items-center group">
                  <div className="w-16 h-16 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 group-hover:border-purple-200 dark:group-hover:border-purple-800 rounded-full flex items-center justify-center shadow-sm transition-all duration-300">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg">{t('upload_csv')}</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('supports_formats')}</p>
                  </div>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    onChange={handleFileUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              )}
            </CardContent>
          </Card>
          {uploadError && (
            <PageErrorState
              title="File processing issue"
              description={uploadError}
              className="min-h-[160px]"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 font-sans animate-in slide-in-from-bottom-4 duration-500 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex flex-wrap items-center gap-2">
              {t('wizard_title')} <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-none"><Sparkles className="w-3 h-3 mr-1" /> {t('human_loop')}</Badge>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">{t('wizard_desc')}</p>
          </div>
          <Button 
            onClick={handleFinalizeClick} 
            disabled={isFinalizing || totalReadyToCommit === 0}
            className="w-full md:w-auto bg-zinc-900 dark:bg-zinc-50 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-lg transition-transform hover:scale-[1.02]"
          >
            {isFinalizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ListChecks className="w-4 h-4 mr-2" />}
            {isFinalizing ? t('locking') : t('finalize_btn', { count: totalReadyToCommit })}
          </Button>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm transition-all hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-1">{t('metrics_ready')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-emerald-900 dark:text-emerald-50">{totalReadyToCommit}</p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-500 font-medium">{t('metrics_verified')}</p>
                </div>
              </div>
              <CheckCircle2 className="w-10 h-10 text-emerald-300 dark:text-emerald-900/50" />
            </CardContent>
          </Card>

          <Card className={`border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm transition-all hover:shadow-md ${needsReviewCount > 0 ? 'ring-2 ring-purple-400 dark:ring-purple-600 ring-offset-2 dark:ring-offset-zinc-950' : ''}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-purple-800 dark:text-purple-400 uppercase tracking-wider mb-1">{t('metrics_review')}</p>
                <p className="text-3xl font-black text-purple-900 dark:text-purple-50">{needsReviewCount}</p>
              </div>
              <Sparkles className="w-10 h-10 text-purple-300 dark:text-purple-900/50" />
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition-all hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider mb-1">{t('metrics_excluded')}</p>
                <p className="text-3xl font-black text-zinc-900 dark:text-zinc-50">{state.ignored.length}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-zinc-200 dark:text-zinc-800" />
            </CardContent>
          </Card>
        </div>

        {/* DATA GRIDS */}
        <Card className="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-950/50">
            <div role="tablist" aria-label={t("workflow_title")} className={cn(segmentedControlContainerClass, "w-full flex-nowrap overflow-x-auto md:flex-wrap")}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={activeTab === "ai"}
                aria-controls="recon-tab-ai"
                onClick={() => setActiveTab("ai")}
                className={cn(
                  "h-auto min-h-11 shrink-0 min-w-[11rem] grow justify-center gap-2 px-4 py-3 text-sm transition-all duration-300",
                  segmentedControlItemClass,
                  activeTab === "ai" && segmentedControlItemActiveClass,
                )}
              >
                <Sparkles className="size-4" /> {t("tab_queue")}
                <Badge variant="secondary" className="ml-1 border-none bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{state.pendingAi.length}</Badge>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={activeTab === "auto"}
                aria-controls="recon-tab-auto"
                onClick={() => setActiveTab("auto")}
                className={cn(
                  "h-auto min-h-11 shrink-0 min-w-[11rem] grow justify-center gap-2 px-4 py-3 text-sm transition-all duration-300",
                  segmentedControlItemClass,
                  activeTab === "auto" && segmentedControlItemActiveClass,
                )}
              >
                <CheckCircle2 className="size-4" /> {t("tab_ready")}
                <Badge variant="secondary" className="ml-1 border-none bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{totalReadyToCommit}</Badge>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={activeTab === "ignored"}
                aria-controls="recon-tab-ignored"
                onClick={() => setActiveTab("ignored")}
                className={cn(
                  "h-auto min-h-11 shrink-0 min-w-[11rem] grow justify-center gap-2 px-4 py-3 text-sm transition-all duration-300",
                  segmentedControlItemClass,
                  activeTab === "ignored" && segmentedControlItemActiveClass,
                )}
              >
                <XCircle className="size-4" /> {t("tab_excluded")}
                <Badge variant="secondary" className="ml-1 border-none bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">{state.ignored.length}</Badge>
              </Button>
            </div>
          </div>

          <CardContent className="p-0">
            {/* TAB: REVIEW QUEUE (AI SUGGESTIONS) */}
            {activeTab === 'ai' && (
              <div id="recon-tab-ai" role="tabpanel" className="overflow-x-auto min-h-[400px]">
                {state.pendingAi.length === 0 ? (
                  <PageEmptyState title={t('empty_queue_title')} description={t('empty_queue_desc')} className="min-h-[400px]" />
                ) : (
                  <Table>
                    <TableHeader className="bg-purple-50/30 dark:bg-purple-900/10">
                      <TableRow className="dark:border-zinc-800">
                        <TableHead className="w-1/3 font-bold dark:text-zinc-400">{t('col_bank_line')}</TableHead>
                        <TableHead className="font-bold dark:text-zinc-400">{t('col_ai_mapping')}</TableHead>
                        <TableHead className="w-24 font-bold text-right dark:text-zinc-400">{t('col_actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.pendingAi.map((item) => (
                        <ReconciliationRow 
                          key={item.id} 
                          transaction={item} 
                          onApprove={handleItemApprove}
                          onIgnore={handleItemIgnore}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* TAB: READY (AUTO + APPROVED) */}
            {activeTab === 'auto' && (
              <div id="recon-tab-auto" role="tabpanel" className="overflow-x-auto min-h-[400px]">
                <DataTableToolbar
                  searchValue={readyTableState.search}
                  onSearchChange={readyTableState.setSearch}
                  searchPlaceholder={t("col_date_desc")}
                />
                <DataTable
                  columns={readyColumns}
                  data={readyRows}
                  rowId={(row) => row.id}
                  emptyTitle={t("no_approved")}
                  emptyDescription="Approve matches to build your ready-to-commit queue."
                />
              </div>
            )}

            {/* TAB: EXCLUDED */}
            {activeTab === 'ignored' && (
              <div id="recon-tab-ignored" role="tabpanel" className="overflow-x-auto min-h-[400px]">
                <Table>
                  <TableBody>
                    {state.ignored.length === 0 ? (
                      <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="p-0 border-none"><PageEmptyState title={t('no_excluded')} description="Ignored lines will appear here for quick restore." className="min-h-[300px]" /></TableCell></TableRow>
                    ) : (
                      state.ignored.map((row) => (
                        <TableRow key={row.id} className="opacity-60 dark:opacity-40 grayscale transition-all hover:opacity-100 hover:grayscale-0 dark:border-zinc-800">
                          <TableCell>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{row.date}</p>
                            <p className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300 line-through">{row.description}</p>
                          </TableCell>
                          <TableCell className="text-right font-medium dark:text-zinc-300">₹{row.amount.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'RESTORE_ITEM', payload: row })} className="dark:border-zinc-700 dark:hover:bg-zinc-800">{t('btn_restore')}</Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

          </CardContent>
        </Card>

        {/* FINALIZE RECONCILIATION MODAL */}
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="dark:text-zinc-50">{t('dialog_title')}</AlertDialogTitle>
              <AlertDialogDescription className="dark:text-zinc-400">
                {t('dialog_desc', { count: totalReadyToCommit })}
                {needsReviewCount > 0 && <span className="block mt-2 text-rose-500 dark:text-rose-400 font-medium">{t('dialog_warning', { reviewCount: needsReviewCount })}</span>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">{t('btn_keep_editing')}</AlertDialogCancel>
              <AlertDialogAction onClick={executeFinalize} className="bg-zinc-900 dark:bg-zinc-50 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900">
                {t('btn_finalize')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}
