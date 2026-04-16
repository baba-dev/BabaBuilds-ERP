"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Plus, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApprovalQueue } from "@/components/workforce/ApprovalQueue";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { StatusBadge } from "@/components/workforce/StatusBadge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type LeaveType = { id: string; name: string; code: string; color: string };
type LeaveRequest = {
  id: string; days: number; startDate: string; endDate: string;
  reason?: string | null; status: string; createdAt: string;
  employee: { id: string; firstName: string; lastName: string; avatarUrl?: string | null; department?: { name: string } | null };
  leaveType: { name: string; code: string; color: string };
};
type LeaveBalance = {
  id: string; entitled: number; used: number; remaining: number; pending: number; year: number;
  leaveType: { name: string; code: string; color: string; isPaid: boolean };
};

const BALANCE_DOT_MAP: Record<string, string> = {
  emerald: "bg-emerald-500", rose: "bg-rose-500", amber: "bg-amber-500",
  zinc: "bg-zinc-500", indigo: "bg-indigo-500", blue: "bg-blue-500",
};

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [canApprove, setCanApprove] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestForm, setRequestForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const statusParam = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
      const [reqRes, balRes, typesRes] = await Promise.all([
        fetch(`/api/workforce/leave/requests${statusParam}`),
        fetch("/api/workforce/leave/balances"),
        fetch("/api/workforce/leave/requests"), // to check canApprove
      ]);

      if (reqRes.ok) {
        const { requests: reqs } = await reqRes.json() as { requests: LeaveRequest[] };
        setRequests(reqs);
      }
      if (balRes.ok) {
        const { balances: bals } = await balRes.json() as { balances: LeaveBalance[] };
        setBalances(bals);
      }

      // Fetch leave types from departments endpoint fallback
      const ltRes = await fetch("/api/workforce/leave/requests?status=ALL");
      if (ltRes.ok) { setCanApprove(true); }

      // Fetch leave types
      const deptRes = await fetch("/api/workforce/settings/departments");
      if (deptRes.ok) {
        // We'll derive leave types from the balances we have
        const types = balances.map((b) => ({
          id: b.id, name: b.leaveType.name, code: b.leaveType.code, color: b.leaveType.color,
        }));
        setLeaveTypes(types);
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSubmitRequest = async () => {
    if (!requestForm.leaveTypeId || !requestForm.startDate || !requestForm.endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/workforce/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: requestForm.leaveTypeId,
          startDate: requestForm.startDate,
          endDate: requestForm.endDate,
          reason: requestForm.reason,
        }),
      });
      if (res.ok) {
        toast.success("Leave request submitted");
        setShowRequestDialog(false);
        setRequestForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
        void fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to submit request");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <>
      <WorkforcePageShell
        title="Leave Management"
        description="Manage leave requests, balances, and approvals across your team."
        actions={
          <>
            <Button id="refresh-leave" variant="ghost" size="sm" onClick={fetchData} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button id="request-leave-btn" size="sm" onClick={() => setShowRequestDialog(true)} className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-500 text-white border-none">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Request Leave
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Leave Balance Cards */}
          {balances.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Leave Balances — {new Date().getFullYear()}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {balances.map((b) => {
                  const pct = b.entitled > 0 ? (b.used / b.entitled) * 100 : 0;
                  const dotColor = BALANCE_DOT_MAP[b.leaveType.color] ?? "bg-zinc-500";
                  return (
                    <div key={b.id} className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-4 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                        <p className="text-[11px] font-semibold text-muted-foreground">{b.leaveType.name}</p>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {b.remaining}
                        <span className="text-sm font-normal text-muted-foreground">/{b.entitled}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">days remaining</p>
                      <div className="mt-3 h-1 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 overflow-hidden">
                        <div className={`h-full rounded-full ${dotColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      {b.pending > 0 && <p className="text-[10px] text-amber-500 mt-1">{b.pending} pending</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* All Requests */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leave Requests</h3>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <Filter className="h-3 w-3 mr-1 text-zinc-500" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse border border-zinc-200/60 dark:border-zinc-800/60" />
                  ))}
                </div>
              ) : requests.length === 0 ? (
                <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 py-12 text-center shadow-sm backdrop-blur-sm">
                  <p className="text-muted-foreground text-sm">No leave requests found.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                  <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
                    {requests.map((req) => {
                      const dotColor = BALANCE_DOT_MAP[req.leaveType.color] ?? "bg-zinc-500";
                      return (
                        <div key={req.id} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/30 transition-colors">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{req.employee.firstName} {req.employee.lastName}</p>
                                <span className="text-xs text-muted-foreground">{req.leaveType.name} · {req.days}d</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(req.startDate), "MMM d")} — {format(new Date(req.endDate), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                          <StatusBadge status={req.status} variant="leave" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Pending Approvals */}
            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200/50 dark:border-zinc-800/50">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Approval</h3>
                {pendingRequests.length > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[9px] font-bold text-amber-400">
                    {pendingRequests.length}
                  </span>
                )}
              </div>
              <div className="p-4">
                <ApprovalQueue requests={pendingRequests} onRefresh={fetchData} canApprove={canApprove} />
              </div>
            </div>
          </div>
        </div>
      </WorkforcePageShell>

      {/* Leave Request Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
            <DialogDescription>Submit a leave request for approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Leave Type *</Label>
              <Select value={requestForm.leaveTypeId} onValueChange={(v) => setRequestForm((f) => ({ ...f, leaveTypeId: v }))}>
                <SelectTrigger id="leave-type-select" className="h-9 text-sm">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {balances.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.leaveType.name} ({b.remaining} days left)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">From *</Label>
                <Input id="leave-start-date" type="date" value={requestForm.startDate} onChange={(e) => setRequestForm((f) => ({ ...f, startDate: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">To *</Label>
                <Input id="leave-end-date" type="date" value={requestForm.endDate} onChange={(e) => setRequestForm((f) => ({ ...f, endDate: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
              <Textarea
                id="leave-reason"
                value={requestForm.reason}
                onChange={(e) => setRequestForm((f) => ({ ...f, reason: e.target.value }))}
                className="text-sm resize-none h-20"
                placeholder="Brief reason for leave..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRequestDialog(false)} className="text-muted-foreground">Cancel</Button>
            <Button id="submit-leave-request" onClick={handleSubmitRequest} disabled={isSubmitting} className="bg-teal-600 hover:bg-teal-500 text-white border-none">
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
