"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  ShieldAlert, Users, Activity, CreditCard,
  ArrowUpCircle, Ban, RefreshCcw, Trash2,
  Server, HardDrive, Cpu, Clock, DollarSign, FileText, Database, ShieldCheck, Download,
  Wrench, Zap, FileWarning, RotateCcw, ScrollText, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Info, Search, Filter, Shield, Hash
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { Banknote } from "lucide-react";
import { ColumnVisibilityToggle, DataTable, DataTableToolbar, RowActionsMenu, useUrlTableState, type DataTableColumnDef } from "@/components/data-table";

export default function SuperAdminPortal() {
  const t = useTranslations('Admin');
  const { fCurrency } = useFormat();
  
  const [tab, setTab] = useState<"OVERVIEW" | "ACCOUNTS" | "DIAGNOSTICS" | "SECURITY" | "MAINTENANCE" | "BACKUP" | "LOGS">("OVERVIEW");
  const [backups, setBackups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userVisibleColumns, setUserVisibleColumns] = useState<string[]>(["user", "workspace", "status", "data", "actions"]);
  const [backupVisibleColumns, setBackupVisibleColumns] = useState<string[]>(["timestamp", "filename", "size", "actions"]);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string; email: string } | null>(null);
  const userTableState = useUrlTableState("admin_users");
  const backupTableState = useUrlTableState("admin_backups");

  // --- LOGS TAB STATE ---
  const [logType, setLogType] = useState<"activity" | "tax_audit">("activity");
  const [logs, setLogs] = useState<any[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPages, setLogsPages] = useState(1);
  const [logsSearch, setLogsSearch] = useState("");
  const [logsStatus, setLogsStatus] = useState("ALL");
  const [logsLoading, setLogsLoading] = useState(false);
  const [logIntegrity, setLogIntegrity] = useState<{ checked: number; valid: boolean; violations: any[] } | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [purgingLogs, setPurgingLogs] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
  const [deletingBackup, setDeletingBackup] = useState(false);

  const fetchLogs = useCallback(async (page = 1, search = logsSearch, status = logsStatus, type = logType) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        page: String(page),
        search,
        status,
      });
      const res = await fetch(`/api/admin/logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.logs ?? []);
      setLogsTotal(data.total ?? 0);
      setLogsPage(data.page ?? 1);
      setLogsPages(data.pages ?? 1);
      if (data.integrity) setLogIntegrity(data.integrity);
      else setLogIntegrity(null);
    } catch (err) {
      toast.error("Failed to load logs.");
    } finally {
      setLogsLoading(false);
    }
  }, [logsSearch, logsStatus, logType]);

  const handlePurgeLogs = async () => {
    setPurgingLogs(true);
    try {
      const res = await fetch(`/api/admin/logs?type=${logType}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purge failed');
      toast.success(`Purged ${data.purged} log entries.`);
      fetchLogs(1, logsSearch, logsStatus, logType);
      setPurgeDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Purge failed');
    } finally {
      setPurgingLogs(false);
    }
  };

  useEffect(() => {
    if (tab === 'LOGS') {
      fetchLogs(1, logsSearch, logsStatus, logType);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, logType]);

  useEffect(() => {
    fetchAdminData();
    fetchDiagnostics();
    fetchMetrics();
    fetchBackups();
    
    // Poll diagnostics every 10 seconds
    const interval = setInterval(fetchDiagnostics, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/admin/backups');
      if (res.ok) setBackups(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error("Unauthorized or Server Error");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      toast.error("Failed to load users data.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDiagnostics = async () => {
    try {
      const res = await fetch('/api/admin/diagnostics');
      if (res.ok) setDiagnostics(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/admin/metrics');
      if (res.ok) setMetrics(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleAction = async (userId: string, action: 'UPGRADE_PRO' | 'UPGRADE_TEAM' | 'SUSPEND' | 'REACTIVATE' | 'DELETE') => {
    const toastId = toast.loading(`Executing ${action}...`);
    try {
      const res = await fetch('/api/admin/users', {
        method: action === 'DELETE' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action })
      });

      if (!res.ok) throw new Error("Action failed");
      
      toast.success(`User successfully updated.`, { id: toastId });
      fetchAdminData(); 
    } catch (error) {
      toast.error(`Failed to ${action} user.`, { id: toastId });
    }
  };

  const handleMaintenanceAction = async (action: string) => {
    const toastId = toast.loading(`Executing maintenance task...`);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      toast.success(data.message || `Task completed successfully.`, { id: toastId });
    } catch (error: any) {
      toast.error(error.message || `Maintenance task failed.`, { id: toastId });
    }
  };

  const handleCreateBackup = async () => {
    const toastId = toast.loading("Creating smart backup...");
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backup failed");
      toast.success(`Backup created: ${data.filename}`, { id: toastId });
      fetchBackups();
    } catch (error: any) {
      toast.error(error.message || "Failed to create backup", { id: toastId });
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    const directUrl = `/api/admin/backups/${filename}`;
    let objectUrl: string | null = null;
    try {
      const res = await fetch(directUrl);
      if (!res.ok) throw new Error("Download failed");
      const sourceBlob = await res.blob();
      const blob = new Blob([sourceBlob], { type: "application/octet-stream" });
      objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error) {
      console.error("Backup download failed", error);
      const popup = window.open(directUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        toast.error("Browser blocked the backup download.", {
          description: "Enable pop-ups/downloads for this site and retry, or open the backup directly.",
          action: {
            label: "Open direct link",
            onClick: () => window.open(directUrl, "_blank", "noopener,noreferrer"),
          },
        });
      }
    } finally {
      if (objectUrl) {
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl as string), 1000);
      }
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    setDeletingBackup(true);
    const toastId = toast.loading("Deleting backup...");
    try {
      const res = await fetch(`/api/admin/backups/${filename}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Backup deleted", { id: toastId });
      fetchBackups();
      setBackupToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete backup", { id: toastId });
    } finally {
      setDeletingBackup(false);
    }
  };

  const filteredUsers = users.filter((u: any) => 
    u.email?.toLowerCase().includes(userTableState.search.toLowerCase()) || 
    u.name?.toLowerCase().includes(userTableState.search.toLowerCase())
  );
  const filteredBackups = backups.filter((b) => b.filename.toLowerCase().includes(backupTableState.search.toLowerCase()));
  const userColumns: DataTableColumnDef<any>[] = [
    {
      id: "user",
      header: t("col_user") || "User",
      accessor: (row) => row.name ?? row.email,
      sortable: true,
      cell: (user) => (
        <div>
          <div className="font-bold text-zinc-900 dark:text-zinc-100">{user.name || t("unnamed") || "Unnamed"}</div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{user.email}</div>
        </div>
      ),
      hideable: true,
    },
    { id: "workspace", header: t("col_ws") || "Workspace", accessor: (row) => row.workspaceName ?? "", sortable: true, cell: (user) => <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{user.workspaceName || t("no_ws") || "No Workspace"}</span>, hideable: true },
    {
      id: "status",
      header: t("col_status") || "Status",
      accessor: (row) => row.subscriptionStatus,
      cell: (user) => user.subscriptionStatus === "PRO" ? (
        <Badge className="bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-none text-xs font-bold uppercase tracking-widest">{t("status_pro") || "PRO"}</Badge>
      ) : user.subscriptionStatus === "TEAM" ? (
        <Badge className="bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-none text-xs font-bold uppercase tracking-widest">{t("status_team") || "TEAM"}</Badge>
      ) : user.subscriptionStatus === "SUSPENDED" ? (
        <Badge className="bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-none text-xs font-bold uppercase tracking-widest">{t("status_suspended") || "SUSPENDED"}</Badge>
      ) : (
        <Badge className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-none text-xs font-bold uppercase tracking-widest">{t("status_free") || "FREE / TRIAL"}</Badge>
      ),
      hideable: true,
    },
    { id: "data", header: <div className="text-right">{t("col_invoices") || "Data"}</div>, accessor: (row) => row.invoiceCount, sortable: true, className: "text-right text-zinc-600 dark:text-zinc-400 font-mono font-bold", cell: (user) => user.invoiceCount, hideable: true },
    {
      id: "actions",
      header: <div className="text-right">{t("col_actions") || "Actions"}</div>,
      className: "text-right",
      cell: (user) => (
        <div className="flex justify-end">
          <RowActionsMenu
            row={user}
            actions={[
              { label: "Force Pro", onClick: (u) => handleAction(u.id, "UPGRADE_PRO"), icon: <ArrowUpCircle className="mr-2 h-4 w-4" /> },
              { label: "Force Team", onClick: (u) => handleAction(u.id, "UPGRADE_TEAM"), icon: <Users className="mr-2 h-4 w-4" /> },
              user.subscriptionStatus === "SUSPENDED"
                ? { label: "Reactivate", onClick: (u) => handleAction(u.id, "REACTIVATE"), icon: <RefreshCcw className="mr-2 h-4 w-4" /> }
                : { label: "Suspend", onClick: (u) => handleAction(u.id, "SUSPEND"), icon: <Ban className="mr-2 h-4 w-4" /> },
              { label: "Delete", onClick: (u) => setUserToDelete({ id: u.id, name: u.name || "Unnamed", email: u.email }), variant: "danger", icon: <Trash2 className="mr-2 h-4 w-4" /> },
            ]}
          />
        </div>
      ),
    },
  ];
  const backupColumns: DataTableColumnDef<any>[] = [
    { id: "timestamp", header: "Timestamp", sortable: true, sortAccessor: (row) => new Date(row.createdAt).getTime(), cell: (row) => <span className="text-xs font-medium text-zinc-500">{new Date(row.createdAt).toLocaleString()}</span>, hideable: true },
    { id: "filename", header: "File Name", accessor: (row) => row.filename, sortable: true, cell: (row) => <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{row.filename}</span>, hideable: true },
    { id: "size", header: "Size", sortable: true, sortAccessor: (row) => row.size, cell: (row) => <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{(row.size / 1024 / 1024).toFixed(2)} MB</span>, hideable: true },
    { id: "actions", header: <div className="text-right">Actions</div>, className: "text-right", cell: (row) => <div className="flex items-center justify-end gap-2"><Button variant="outline" size="sm" className="h-7 px-2 text-xs font-bold uppercase border-zinc-200 dark:border-zinc-800" onClick={() => handleDownloadBackup(row.filename)}><Download className="w-3 h-3 mr-1" /> Download</Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={() => setBackupToDelete(row.filename)}><Trash2 className="w-3 h-3" /></Button></div> },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      
      {/* GOD MODE HEADER */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-zinc-200/50 bg-zinc-50/50 px-4 py-6 backdrop-blur-md transition-all duration-300 dark:border-zinc-800/50 dark:bg-zinc-950/50 md:-mx-8 md:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-500 animate-pulse" />
              <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50 dark:text-rose-500 dark:border-rose-500/30 dark:bg-rose-500/10 uppercase tracking-widest text-xs font-bold">
                {t('god_mode') || 'GOD MODE'}
              </Badge>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">{t('title') || 'Platform Command'}</h1>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('desc') || 'System-wide visibility and billing controls.'}</p>
          </div>
        </div>
      </div>

      {/* GOD MODE NAVIGATION */}
      <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-zinc-200 pb-1 dark:border-zinc-800">
        {["OVERVIEW", "ACCOUNTS", "DIAGNOSTICS", "SECURITY", "MAINTENANCE", "BACKUP", "LOGS"].map((tName) => (
          <button
            key={tName}
            onClick={() => setTab(tName as any)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-widest rounded-t-lg transition-all flex items-center gap-1.5 ${
              tab === tName 
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md" 
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {tName === 'LOGS' && <ScrollText className="w-3.5 h-3.5" />}
            {tName}
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}
      <div>
        {tab === "OVERVIEW" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ROW 1: SERVER METRICS */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" /> Server & Infrastructure
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Memory Usage</CardTitle>
                    <HardDrive className="w-4 h-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
                      {diagnostics?.memory?.percent || '...'}%
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{diagnostics?.memory?.used || '...'} / {diagnostics?.memory?.total || '...'}</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">CPU Load (Avg)</CardTitle>
                    <Cpu className="w-4 h-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
                      {diagnostics?.cpu?.loadAverage ? diagnostics.cpu.loadAverage.split(',')[0] : '...'}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{diagnostics?.cpu?.cores || '...'} Cores Available</p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">DB Latency</CardTitle>
                    <Database className="w-4 h-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
                      {diagnostics?.databaseLatency || '...'}
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{diagnostics?.status || '...'}</p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Uptime</CardTitle>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
                      {diagnostics?.uptime || '...'}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">System Node</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ROW 2: SAAS METRICS */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" /> SaaS Business Metrics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-800 dark:border-zinc-200 shadow-lg">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between opacity-80">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">Est. MRR</CardTitle>
                    <Banknote className="w-4 h-4" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-extrabold">{metrics?.mrr ? fCurrency(metrics.mrr) : '...'}</div>
                    <p className="text-xs opacity-70 mt-1">Recurring Revenue</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Active PRO</CardTitle>
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                      {metrics?.activeSubscriptions || '...'}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Out of {metrics?.totalWorkspaces || '...'} workspaces</p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Documents</CardTitle>
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {metrics?.totalDocuments?.toLocaleString() || '...'}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Platform-wide usage</p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Platform GMV</CardTitle>
                    <CreditCard className="w-4 h-4 text-zinc-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
                      {metrics?.platformGmv ? fCurrency(metrics.platformGmv) : '...'}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Gross volume moved</p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Auth Failures</CardTitle>
                    <FileWarning className="w-4 h-4 text-rose-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
                      {metrics?.authFailureCount ?? '...'}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 truncate">
                      Top: {metrics?.authFailureByReason?.[0]?.reason || 'none'} ({metrics?.authFailureByReason?.[0]?.count || 0})
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {tab === "ACCOUNTS" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
              <CardHeader className="border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-zinc-900 dark:text-zinc-50">{t('panel_title') || 'Platform Accounts'}</CardTitle>
                  <CardDescription className="text-zinc-500 dark:text-zinc-400 font-medium mt-1">{t('panel_desc') || 'Manage and monitor all accounts.'}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <DataTableToolbar
                  searchValue={userTableState.search}
                  onSearchChange={userTableState.setSearch}
                  searchPlaceholder={t("search_placeholder") || "Search users..."}
                  rightSlot={
                    <div className="hidden md:block">
                      <ColumnVisibilityToggle
                        options={userColumns.filter((col) => col.hideable).map((col) => ({
                          id: col.id,
                          label: typeof col.header === "string" ? col.header : col.id,
                          visible: userVisibleColumns.includes(col.id),
                          onToggle: () => setUserVisibleColumns((prev) => prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]),
                        }))}
                      />
                    </div>
                  }
                />
                <div className="hidden md:block">
                  <DataTable
                    columns={userColumns}
                    data={filteredUsers}
                    rowId={(row) => row.id}
                    loading={isLoading}
                    emptyTitle={t("no_users") || "No users found."}
                    emptyDescription="Try a different query or refresh admin data."
                    visibleColumnIds={userVisibleColumns}
                  />
                </div>
                <div className="space-y-3 pb-24 md:hidden">
                  {filteredUsers.map((user) => (
                    <Card key={user.id} className="border-zinc-200 dark:border-zinc-800">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{user.name || t("unnamed") || "Unnamed"}</p>
                            <p className="text-xs text-zinc-500">{user.email}</p>
                          </div>
                          <Badge variant="secondary">{user.subscriptionStatus}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <p>Workspace: {user.workspaceName || t("no_ws") || "No Workspace"}</p>
                          <p className="text-right">Invoices: {user.invoiceCount}</p>
                        </div>
                        <details className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                          <summary className="cursor-pointer font-semibold">More actions</summary>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button variant="outline" size="sm" onClick={() => handleAction(user.id, "UPGRADE_PRO")}>Force Pro</Button>
                            <Button variant="outline" size="sm" onClick={() => handleAction(user.id, user.subscriptionStatus === "SUSPENDED" ? "REACTIVATE" : "SUSPEND")}>
                              {user.subscriptionStatus === "SUSPENDED" ? "Reactivate" : "Suspend"}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => setUserToDelete({ id: user.id, name: user.name || "Unnamed", email: user.email })}>Delete</Button>
                          </div>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
                  <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">{filteredUsers.length} users</p>
                    <Button size="sm" onClick={fetchAdminData}>Refresh users</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "SECURITY" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm border-l-4 border-l-rose-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-900 dark:text-white"><ShieldCheck className="w-5 h-5 text-rose-500" /> CrowdSec WAF Configuration</CardTitle>
                <CardDescription>Setup your server-level IPS bouncer to drop malicious traffic automatically.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 font-mono text-xs overflow-x-auto text-zinc-700 dark:text-zinc-300">
                  <p className="text-rose-600 dark:text-rose-400 font-bold mb-2"># How to generate your LAPI key directly on your server:</p>
                  <code>
                    1. Ensure CrowdSec is installed on the server.<br/>
                    2. Run: <span className="text-indigo-600 dark:text-indigo-400">sudo cscli bouncers add nextjs-frontend</span><br/>
                    3. Copy the generated API key.<br/>
                    4. Add it to your Next.js <span className="font-bold">.env</span> file:<br/><br/>
                    CROWDSEC_LAPI_URL=http://127.0.0.1:8080<br/>
                    CROWDSEC_BOUNCER_KEY=your_generated_key_here<br/><br/>
                    5. Restart your Next.js application.
                  </code>
                </div>
                <div className="flex items-center gap-2 mt-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  Middleware Interception is Active 
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm border-l-4 border-l-indigo-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-900 dark:text-white"><Activity className="w-5 h-5 text-indigo-500" /> ClamAV File Scanning</CardTitle>
                <CardDescription>Zero-day memory buffering file scanner implemented across all `FormData` upload routes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">ACTIVE</p>
                   </div>
                   <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Scan Strategy</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">In-memory buffer drop before disk write</p>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "DIAGNOSTICS" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-zinc-950 border-zinc-800 text-zinc-300 font-mono shadow-2xl">
              <CardHeader className="border-b border-zinc-800 pb-4">
                <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-500" /> System Terminal Simulator Output
                </CardTitle>
                <CardDescription className="text-zinc-500">Live feed from `os` module</CardDescription>
              </CardHeader>
              <CardContent className="p-6 text-sm">
                 <div className="space-y-2">
                    <p><span className="text-indigo-400">system@bababuilds</span>:~$ fetch_diagnostics</p>
                    <p className="text-emerald-400">CONNECTION ESTABLISHED</p>
                    <br/>
                    <p><span className="text-zinc-500"># Database Information</span></p>
                    <p>Database Ping latency........... <span className="text-white font-bold">{diagnostics?.databaseLatency || '...'}</span></p>
                    <p>Health Status................... <Badge className="bg-emerald-500/20 text-emerald-400 border-none scale-75 origin-left">{diagnostics?.status || '...'}</Badge></p>
                    <br/>
                    <p><span className="text-zinc-500"># Hardware Instance</span></p>
                    <p>Total Memory.................. <span className="text-white font-bold">{diagnostics?.memory?.total || '...'}</span></p>
                    <p>Used Memory................... <span className="text-rose-400 font-bold">{diagnostics?.memory?.used || '...'}</span></p>
                    <p>Usage Percent................. <span className="text-amber-400 font-bold">{diagnostics?.memory?.percent || '...'}%</span></p>
                    <p>CPU Model..................... <span className="text-white font-bold">{diagnostics?.cpu?.model || '...'}</span></p>
                    <p>Uptime........................ <span className="text-blue-400 font-bold">{diagnostics?.uptime || '...'}</span></p>
                 </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "MAINTENANCE" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4" /> System Maintenance Menu
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-rose-500 transition-colors cursor-pointer" onClick={() => handleMaintenanceAction('PURGE_DEMO')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Purge Demo Accounts</CardTitle>
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </div>
                  <CardDescription className="text-xs">Deletes all users & workspaces associated with bababuilds.demo</CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-amber-500 transition-colors cursor-pointer" onClick={() => handleMaintenanceAction('PRUNE_FILES')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Prune Orphaned Files</CardTitle>
                    <FileWarning className="w-4 h-4 text-amber-500" />
                  </div>
                  <CardDescription className="text-xs">Scans public storage folders and removes dangling receipts/logos.</CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-blue-500 transition-colors cursor-pointer" onClick={() => handleMaintenanceAction('REGENERATE_INVOICES')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Regenerate All Invoices</CardTitle>
                    <RefreshCcw className="w-4 h-4 text-blue-500" />
                  </div>
                  <CardDescription className="text-xs">Re-generates all PDFs with the latest design fixes and layout updates.</CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-indigo-500 transition-colors cursor-pointer" onClick={() => handleMaintenanceAction('CLEAR_LOGS')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Clear System Logs</CardTitle>
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </div>
                  <CardDescription className="text-xs">Truncates all local .log files generated by the backend.</CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-emerald-500 transition-colors cursor-pointer" onClick={() => handleMaintenanceAction('STAMP_PAID_INVOICES')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Retro-Stamp Paid Invoices</CardTitle>
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  </div>
                  <CardDescription className="text-xs">Applies missing 'PAID' watermarks and receipt dates to historical invoices.</CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-blue-500 transition-colors cursor-pointer" onClick={() => handleMaintenanceAction('CLEAR_CACHE')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Clear Output Cache</CardTitle>
                    <Zap className="w-4 h-4 text-blue-500" />
                  </div>
                  <CardDescription className="text-xs">Clears the Next.js .next/cache directory to rebuild assets on the fly.</CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-emerald-500 transition-colors cursor-pointer md:col-span-2" onClick={() => handleMaintenanceAction('REBOOT')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Soft Reboot Application</CardTitle>
                    <RotateCcw className="w-4 h-4 text-emerald-500" />
                  </div>
                  <CardDescription className="text-xs">Sends a process exit signal to force the process manager (PM2/Docker) to restart.</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        )}

        {tab === "BACKUP" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <Database className="w-4 h-4" /> Smart Backup Hub
              </h2>
              <Button 
                onClick={handleCreateBackup}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2"
              >
                <Zap className="w-4 h-4" /> Trigger Smart Backup
              </Button>
            </div>

            <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
               <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
                  <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">Active Backups Archive (Last 5)</CardTitle>
                  <CardDescription className="text-xs">Database and volatile files (.pdf, .png, .jpg) snapshot</CardDescription>
               </CardHeader>
               <CardContent className="p-4">
                <DataTableToolbar
                  searchValue={backupTableState.search}
                  onSearchChange={backupTableState.setSearch}
                  searchPlaceholder="Search backups..."
                  rightSlot={
                    <div className="hidden md:block">
                      <ColumnVisibilityToggle
                        options={backupColumns.filter((col) => col.hideable).map((col) => ({
                          id: col.id,
                          label: typeof col.header === "string" ? col.header : col.id,
                          visible: backupVisibleColumns.includes(col.id),
                          onToggle: () => setBackupVisibleColumns((prev) => prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]),
                        }))}
                      />
                    </div>
                  }
                />
                <div className="hidden md:block">
                  <DataTable
                    columns={backupColumns}
                    data={filteredBackups}
                    rowId={(row) => row.filename}
                    emptyTitle="No backups found in the archive."
                    emptyDescription="Trigger a smart backup to populate this table."
                    visibleColumnIds={backupVisibleColumns}
                  />
                </div>
                <div className="space-y-3 pb-24 md:hidden">
                  {filteredBackups.map((backup) => (
                    <Card key={backup.filename} className="border-zinc-200 dark:border-zinc-800">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{backup.filename}</p>
                          <p className="text-xs text-zinc-500">{(backup.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <p className="text-xs text-zinc-500">{new Date(backup.createdAt).toLocaleString()}</p>
                        <details className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                          <summary className="cursor-pointer font-semibold">More actions</summary>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button variant="outline" size="sm" onClick={() => handleDownloadBackup(backup.filename)}>
                              <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => setBackupToDelete(backup.filename)}>
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                            </Button>
                          </div>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </div>
               </CardContent>
            </Card>
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">{filteredBackups.length} backups</p>
                <Button size="sm" onClick={handleCreateBackup} className="bg-indigo-600 text-white hover:bg-indigo-700">Trigger Backup</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <Card className="bg-zinc-900 border-zinc-800 text-zinc-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-100">Smart Logic Protocol</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed space-y-2">
                    <p>• Snapshots include <span className="text-emerald-400 font-bold">prisma/dev.db</span> integrity copy.</p>
                    <p>• Recursively zips <span className="text-indigo-400 font-bold">public/invoices/</span>, <span className="text-indigo-400 font-bold">public/logos/</span>, and <span className="text-indigo-400 font-bold">public/receipts/</span>.</p>
                    <p>• Automatic pruning active: Oldest backups removed after <span className="text-amber-400 font-bold">N=5</span> limit reached.</p>
                  </CardContent>
               </Card>
               
               <Card className="bg-rose-950/20 border-rose-900/50 text-rose-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-rose-400 flex items-center gap-2">
                      <ShieldCheck className="w-3 h-3" /> Strict Security Protocol
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed space-y-2">
                    <p>• Environment configuration (<span className="text-white font-bold">.env</span>) is explicitly <span className="text-rose-500 font-bold">EXCLUDED</span> from all snapshots.</p>
                    <p>• Direct file access via URL is <span className="text-rose-500 font-bold">BLOCKED</span> — all exports served via Next.js Auth Session pipes.</p>
                    <p>• Admin-level session fingerprint required for all CRUD operations.</p>
                  </CardContent>
               </Card>
            </div>
          </div>
        )}

        {tab === "LOGS" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* LOG TYPE SWITCHER + CONTROLS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 gap-1">
                  <button
                    onClick={() => { setLogType('activity'); setLogsPage(1); setLogsSearch(''); setLogsStatus('ALL'); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      logType === 'activity'
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Activity className="w-3 h-3" /> Activity Log
                  </button>
                  <button
                    onClick={() => { setLogType('tax_audit'); setLogsPage(1); setLogsSearch(''); setLogsStatus('ALL'); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      logType === 'tax_audit'
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Shield className="w-3 h-3" /> Tax Audit Chain
                  </button>
                </div>

                {/* Integrity badge for tax audit */}
                {logType === 'tax_audit' && logIntegrity && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                    logIntegrity.valid
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
                  }`}>
                    {logIntegrity.valid
                      ? <><CheckCircle2 className="w-3.5 h-3.5" /> Chain Intact ({logIntegrity.checked} entries)</>  
                      : <><XCircle className="w-3.5 h-3.5" /> {logIntegrity.violations.length} Violations Detected!</>}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(logsPage, logsSearch, logsStatus, logType)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <RefreshCcw className="w-3 h-3" /> Refresh
                </button>
                <button
                  onClick={() => setPurgeDialogOpen(true)}
                  disabled={purgingLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3 h-3" /> {purgingLogs ? 'Purging...' : 'Purge Logs'}
                </button>
              </div>
            </div>

            {/* SEARCH + FILTER BAR */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder={logType === 'activity' ? 'Search action, email, entity, IP...' : 'Search action, email, scope...'}
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLogs(1, logsSearch, logsStatus, logType)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              {logType === 'activity' && (
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <select
                    value={logsStatus}
                    onChange={(e) => { setLogsStatus(e.target.value); fetchLogs(1, logsSearch, e.target.value, logType); }}
                    className="pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none cursor-pointer"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="FAILURE">FAILURE</option>
                    <option value="WARNING">WARNING</option>
                    <option value="INFO">INFO</option>
                  </select>
                </div>
              )}
              <button
                onClick={() => fetchLogs(1, logsSearch, logsStatus, logType)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
              >
                Search
              </button>
            </div>

            {/* STATS ROW */}
            <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">{logsTotal.toLocaleString()}</span> total entries
              <span>·</span>
              <span>Page <span className="font-bold text-zinc-900 dark:text-zinc-100">{logsPage}</span> of <span className="font-bold text-zinc-900 dark:text-zinc-100">{logsPages}</span></span>
              {logsLoading && <span className="animate-pulse text-indigo-500">Loading...</span>}
            </div>

            {/* ACTIVITY LOG TABLE */}
            {logType === 'activity' && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400 w-32">Status</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Action</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Actor</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Entity</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Workspace</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">IP</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400 w-40">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {logsLoading && logs.length === 0 ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            {Array.from({ length: 7 }).map((__, j) => (
                              <td key={j} className="px-4 py-3"><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" /></td>
                            ))}
                          </tr>
                        ))
                      ) : logs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                            <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="font-medium">No log entries found</p>
                            <p className="text-xs mt-1">Activity will appear here as users interact with the platform.</p>
                          </td>
                        </tr>
                      ) : logs.map((log: any) => (
                        <>
                          <tr
                            key={log.id}
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3">
                              {log.status === 'SUCCESS' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" />SUCCESS
                                </span>
                              )}
                              {log.status === 'FAILURE' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400">
                                  <XCircle className="w-3 h-3" />FAILURE
                                </span>
                              )}
                              {log.status === 'WARNING' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="w-3 h-3" />WARNING
                                </span>
                              )}
                              {log.status === 'INFO' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                  <Info className="w-3 h-3" />INFO
                                </span>
                              )}
                              {!['SUCCESS','FAILURE','WARNING','INFO'].includes(log.status) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                                  {log.status}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <code className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{log.action}</code>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs">
                                {log.actorEmail ? (
                                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{log.actorEmail}</span>
                                ) : (
                                  <span className="text-zinc-400 italic">system</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {log.entityType ? (
                                <div className="text-xs">
                                  <span className="font-medium text-zinc-600 dark:text-zinc-400">{log.entityType}</span>
                                  {log.entityId && <span className="text-zinc-400 ml-1 font-mono">#{log.entityId.slice(-6)}</span>}
                                </div>
                              ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[120px] block">
                                {log.workspace?.name ?? (log.workspaceId ? log.workspaceId.slice(-8) : <span className="text-zinc-300 dark:text-zinc-600">—</span>)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <code className="text-xs font-mono text-zinc-500 dark:text-zinc-400">{log.ipAddress ?? '—'}</code>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                          </tr>
                          {expandedLogId === log.id && (
                            <tr key={`${log.id}-expanded`} className="bg-zinc-50 dark:bg-zinc-950">
                              <td colSpan={7} className="px-6 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                  <div>
                                    <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Correlation ID</p>
                                    <code className="font-mono text-zinc-700 dark:text-zinc-300 break-all">{log.correlationId ?? '—'}</code>
                                  </div>
                                  <div>
                                    <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">User Agent</p>
                                    <span className="text-zinc-600 dark:text-zinc-400 break-all">{log.userAgent ?? '—'}</span>
                                  </div>
                                  <div>
                                    <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Metadata</p>
                                    <pre className="text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900 rounded p-2 overflow-x-auto text-xs max-h-32">
                                      {log.metadata ? JSON.stringify(log.metadata, null, 2) : '—'}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAX AUDIT CHAIN TABLE */}
            {logType === 'tax_audit' && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Action</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Scope</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Rate</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Actor</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Source</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Hash</th>
                        <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400 w-40">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {logsLoading && logs.length === 0 ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            {Array.from({ length: 7 }).map((__, j) => (
                              <td key={j} className="px-4 py-3"><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" /></td>
                            ))}
                          </tr>
                        ))
                      ) : logs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="font-medium">No tax audit entries</p>
                            <p className="text-xs mt-1">Tax rate overrides will appear here with a cryptographic chain.</p>
                          </td>
                        </tr>
                      ) : logs.map((log: any) => {
                        const isViolation = logIntegrity?.violations?.some((v: any) => v.id === log.id);
                        return (
                          <>
                            <tr
                              key={log.id}
                              onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                              className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors ${
                                isViolation ? 'bg-rose-50/50 dark:bg-rose-950/20 border-l-2 border-l-rose-500' : ''
                              }`}
                            >
                              <td className="px-4 py-3">
                                <code className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">{log.action}</code>
                                {isViolation && <span className="ml-2 text-rose-500"><AlertTriangle className="w-3 h-3 inline" /></span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-xs">
                                  <span className="font-bold text-zinc-700 dark:text-zinc-300">{log.scopeType}</span>
                                  {log.scopeRef && <span className="text-zinc-400 ml-1">/ {log.scopeRef}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                  {log.rate != null ? `${log.rate}%` : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-zinc-600 dark:text-zinc-400">{log.actorEmail ?? <span className="text-zinc-300 dark:text-zinc-600 italic">system</span>}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium">{log.decisionSource}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <Hash className="w-3 h-3 text-zinc-400" />
                                  <code className="text-xs font-mono text-zinc-400 dark:text-zinc-500">{log.entryHash ? log.entryHash.slice(0, 10) + '...' : '—'}</code>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                  {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </td>
                            </tr>
                            {expandedLogId === log.id && (
                              <tr key={`${log.id}-expanded`} className="bg-zinc-50 dark:bg-zinc-950">
                                <td colSpan={7} className="px-6 py-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                    <div>
                                      <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Effective Period</p>
                                      <span className="text-zinc-700 dark:text-zinc-300">
                                        {log.effectiveFrom ? new Date(log.effectiveFrom).toLocaleDateString() : '—'}
                                        {log.effectiveTo ? ` → ${new Date(log.effectiveTo).toLocaleDateString()}` : ' → ongoing'}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Reason</p>
                                      <span className="text-zinc-600 dark:text-zinc-400">{log.reason ?? '—'}</span>
                                    </div>
                                    <div>
                                      <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Full Entry Hash</p>
                                      <code className="font-mono text-zinc-500 dark:text-zinc-400 break-all text-xs">{log.entryHash ?? '—'}</code>
                                    </div>
                                    <div>
                                      <p className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Prev Hash</p>
                                      <code className="font-mono text-zinc-500 dark:text-zinc-400 break-all text-xs">{log.prevHash ?? 'genesis'}</code>
                                    </div>
                                  </div>
                                  {isViolation && (
                                    <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                      <span><strong>Chain Violation:</strong> This entry has a hash mismatch — it may have been tampered with or the chain was disrupted.</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAGINATION */}
            {logsPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-zinc-500">
                  Showing {((logsPage - 1) * 50) + 1}–{Math.min(logsPage * 50, logsTotal)} of {logsTotal.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { const p = logsPage - 1; setLogsPage(p); fetchLogs(p, logsSearch, logsStatus, logType); }}
                    disabled={logsPage <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 px-2">{logsPage} / {logsPages}</span>
                  <button
                    onClick={() => { const p = logsPage + 1; setLogsPage(p); fetchLogs(p, logsSearch, logsStatus, logType); }}
                    disabled={logsPage >= logsPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* DELETE USER CONFIRMATION DIALOG */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Permanently Delete User
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-zinc-400 space-y-2">
              <span className="block">
                You are about to permanently delete{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">{userToDelete?.name}</strong>{" "}
                (<span className="font-mono text-xs">{userToDelete?.email}</span>).
              </span>
              <span className="block font-semibold text-rose-600 dark:text-rose-400">
                This will cascade-delete their workspace, all invoices, clients, retainers, and expenses. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (userToDelete) handleAction(userToDelete.id, 'DELETE');
                setUserToDelete(null);
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white border-none"
            >
              Yes, Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Purge all {logType === "tax_audit" ? "tax audit" : "activity"} logs?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-zinc-400">
              This will permanently remove every {logType === "tax_audit" ? "tax audit" : "activity"} log entry from the system. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgingLogs}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurgeLogs}
              disabled={purgingLogs}
              className="bg-rose-600 hover:bg-rose-700 text-white border-none disabled:opacity-50"
            >
              {purgingLogs ? "Purging..." : "Yes, Purge Logs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!backupToDelete} onOpenChange={(open) => { if (!open && !deletingBackup) setBackupToDelete(null); }}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Delete backup?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-zinc-400 space-y-2">
              <span className="block">
                You are about to permanently delete{" "}
                <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{backupToDelete}</span>.
              </span>
              <span className="block font-semibold text-rose-600 dark:text-rose-400">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBackup}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => backupToDelete && handleDeleteBackup(backupToDelete)}
              disabled={deletingBackup}
              className="bg-rose-600 hover:bg-rose-700 text-white border-none disabled:opacity-50"
            >
              {deletingBackup ? "Deleting..." : "Delete backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
