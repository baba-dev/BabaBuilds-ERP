"use client";

import { useState, useEffect } from "react";
import { 
  ShieldAlert, Users, Activity, CreditCard, Search, 
  MoreVertical, ArrowUpCircle, Ban, RefreshCcw, Trash2,
  Server, HardDrive, Cpu, Clock, DollarSign, FileText, Database, ShieldCheck, Download,
  Wrench, Zap, FileWarning, RotateCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { Banknote } from "lucide-react";

export default function SuperAdminPortal() {
  const t = useTranslations('Admin');
  const { fCurrency } = useFormat();
  
  const [tab, setTab] = useState<"OVERVIEW" | "ACCOUNTS" | "DIAGNOSTICS" | "SECURITY" | "MAINTENANCE" | "BACKUP">("OVERVIEW");
  const [backups, setBackups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string; email: string } | null>(null);

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

  const handleAction = async (userId: string, action: 'UPGRADE' | 'SUSPEND' | 'REACTIVATE' | 'DELETE') => {
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

  const handleDownloadBackup = (filename: string) => {
    window.open(`/api/admin/backups/${filename}`, '_blank');
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm("Are you sure you want to delete this backup?")) return;
    const toastId = toast.loading("Deleting backup...");
    try {
      const res = await fetch(`/api/admin/backups/${filename}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Backup deleted", { id: toastId });
      fetchBackups();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete backup", { id: toastId });
    }
  };

  const filteredUsers = users.filter((u: any) => 
    u.email?.toLowerCase().includes(search.toLowerCase()) || 
    u.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      
      {/* GOD MODE HEADER */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-6 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300 mb-6">
        <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-500 animate-pulse" />
              <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50 dark:text-rose-500 dark:border-rose-500/30 dark:bg-rose-500/10 uppercase tracking-widest text-xs font-bold">
                {t('god_mode') || 'GOD MODE'}
              </Badge>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">{t('title') || 'Platform Command'}</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">{t('desc') || 'System-wide visibility and billing controls.'}</p>
          </div>
        </div>
      </div>

      {/* GOD MODE NAVIGATION */}
      <div className="flex space-x-2 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto pb-1 scrollbar-hide">
        {["OVERVIEW", "ACCOUNTS", "DIAGNOSTICS", "SECURITY", "MAINTENANCE", "BACKUP"].map((tName) => (
          <button
            key={tName}
            onClick={() => setTab(tName as any)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-widest rounded-t-lg transition-all ${
              tab === tName 
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md" 
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {tName}
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}
      <div className="pt-2">
        {tab === "OVERVIEW" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ROW 1: SERVER METRICS */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" /> Server & Infrastructure
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                  <Input 
                    placeholder={t('search_placeholder') || 'Search users...'} 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50 dark:bg-zinc-950/50">
                      <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('col_user') || 'User'}</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('col_ws') || 'Workspace'}</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('col_status') || 'Status'}</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 text-right">{t('col_invoices') || 'Data'}</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 text-right">{t('col_actions') || 'Actions'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-400 dark:text-zinc-500 animate-pulse text-xs font-bold uppercase tracking-widest">{t('loading') || 'Loading...'}</TableCell></TableRow>
                      ) : filteredUsers.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-xs font-bold uppercase tracking-widest">{t('no_users') || 'No users found.'}</TableCell></TableRow>
                      ) : filteredUsers.map((user: any) => (
                        <TableRow key={user.id} className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <TableCell>
                            <div className="font-bold text-zinc-900 dark:text-zinc-100">{user.name || t('unnamed') || 'Unnamed'}</div>
                            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{user.email}</div>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{user.workspaceName || t('no_ws') || 'No Workspace'}</TableCell>
                          <TableCell>
                            {user.subscriptionStatus === 'PRO' ? (
                              <Badge className="bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-none text-xs font-bold uppercase tracking-widest">{t('status_pro') || 'PRO'}</Badge>
                            ) : user.subscriptionStatus === 'SUSPENDED' ? (
                              <Badge className="bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-none text-xs font-bold uppercase tracking-widest">{t('status_suspended') || 'SUSPENDED'}</Badge>
                            ) : (
                              <Badge className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-none text-xs font-bold uppercase tracking-widest">{t('status_free') || 'FREE'}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-zinc-600 dark:text-zinc-400 font-mono font-bold">{user.invoiceCount}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                  <MoreVertical className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl">
                                <DropdownMenuItem onClick={() => handleAction(user.id, 'UPGRADE')} className="cursor-pointer font-medium">
                                  <ArrowUpCircle className="w-4 h-4 mr-2" /> Force Pro
                                </DropdownMenuItem>
                                {user.subscriptionStatus === 'SUSPENDED' ? (
                                  <DropdownMenuItem onClick={() => handleAction(user.id, 'REACTIVATE')} className="cursor-pointer font-medium text-blue-600">
                                    <RefreshCcw className="w-4 h-4 mr-2" /> Reactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleAction(user.id, 'SUSPEND')} className="cursor-pointer font-medium text-amber-600">
                                    <Ban className="w-4 h-4 mr-2" /> Suspend
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setUserToDelete({ id: user.id, name: user.name || 'Unnamed', email: user.email })}
                                  className="cursor-pointer text-rose-600 font-bold"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
               <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-zinc-50/30 dark:bg-zinc-950/30">
                      <TableRow className="border-zinc-200 dark:border-zinc-800">
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500">Timestamp</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500">File Name</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500">Size</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-widest text-zinc-500 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backups.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-zinc-400 text-xs font-bold uppercase tracking-widest bg-zinc-50/10 dark:bg-zinc-900/10">
                            No backups found in the archive.
                          </TableCell>
                        </TableRow>
                      ) : backups.map((b) => (
                        <TableRow key={b.filename} className="border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                          <TableCell className="text-xs font-medium text-zinc-500">
                            {new Date(b.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {b.filename}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            {(b.size / 1024 / 1024).toFixed(2)} MB
                          </TableCell>
                          <TableCell className="text-right flex items-center justify-end gap-2">
                             <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 px-2 text-xs font-bold uppercase border-zinc-200 dark:border-zinc-800"
                              onClick={() => handleDownloadBackup(b.filename)}
                             >
                                <Download className="w-3 h-3 mr-1" /> Download
                             </Button>
                             <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              onClick={() => handleDeleteBackup(b.filename)}
                             >
                                <Trash2 className="w-3 h-3" />
                             </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
               </CardContent>
            </Card>

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
    </div>
  );
}