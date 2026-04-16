"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, X, Clock, User, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, EmployeeAvatar } from "@/components/workforce/StatusBadge";
import { format } from "date-fns";

type LeaveRequest = {
  id: string;
  days: number;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  createdAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
    department?: { name: string } | null;
  };
  leaveType: { name: string; code: string; color: string };
};

interface ApprovalQueueProps {
  requests: LeaveRequest[];
  onRefresh: () => void;
  canApprove: boolean;
}

const LEAVE_TYPE_DOT_COLORS: Record<string, string> = {
  emerald: "bg-emerald-500",
  rose:    "bg-rose-500",
  amber:   "bg-amber-500",
  zinc:    "bg-zinc-500",
  indigo:  "bg-indigo-500",
  blue:    "bg-blue-500",
};

export function ApprovalQueue({ requests, onRefresh, canApprove }: ApprovalQueueProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAction = async (id: string, action: "APPROVE" | "REJECT") => {
    setLoadingId(`${id}-${action}`);
    try {
      const res = await fetch(`/api/workforce/leave/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(action === "APPROVE" ? "Leave approved" : "Leave rejected");
        onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Action failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoadingId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <CheckCircle2 className="h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-500 font-medium">All clear</p>
        <p className="text-xs text-zinc-600">No pending leave requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => {
        const isApprovingThis = loadingId === `${req.id}-APPROVE`;
        const isRejectingThis = loadingId === `${req.id}-REJECT`;
        const dotColor = LEAVE_TYPE_DOT_COLORS[req.leaveType.color] ?? "bg-zinc-500";

        return (
          <div
            key={req.id}
            className="group rounded-xl border border-white/5 bg-zinc-900/50 p-4 hover:border-white/10 transition-all"
          >
            <div className="flex items-start gap-3">
              <EmployeeAvatar
                firstName={req.employee.firstName}
                lastName={req.employee.lastName}
                avatarUrl={req.employee.avatarUrl}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      {req.employee.firstName} {req.employee.lastName}
                    </p>
                    {req.employee.department && (
                      <p className="text-[11px] text-zinc-500">{req.employee.department.name}</p>
                    )}
                  </div>
                  <StatusBadge status={req.status} variant="leave" className="shrink-0" />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                    {req.leaveType.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(req.startDate), "MMM d")} — {format(new Date(req.endDate), "MMM d, yyyy")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {req.days} {req.days === 1 ? "day" : "days"}
                  </span>
                </div>

                {req.reason && (
                  <p className="mt-2 text-xs text-zinc-500 flex items-start gap-1">
                    <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                    {req.reason}
                  </p>
                )}

                {canApprove && req.status === "PENDING" && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      id={`approve-${req.id}`}
                      size="sm"
                      disabled={isApprovingThis || isRejectingThis}
                      onClick={() => handleAction(req.id, "APPROVE")}
                      className="h-7 px-3 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white border-none"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {isApprovingThis ? "Approving..." : "Approve"}
                    </Button>
                    <Button
                      id={`reject-${req.id}`}
                      size="sm"
                      variant="ghost"
                      disabled={isApprovingThis || isRejectingThis}
                      onClick={() => handleAction(req.id, "REJECT")}
                      className="h-7 px-3 text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    >
                      <X className="h-3 w-3 mr-1" />
                      {isRejectingThis ? "Rejecting..." : "Reject"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
