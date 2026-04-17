"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users2, Clock, CalendarDays, AlertCircle, Plus,
  TrendingUp, UserCheck, Activity, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalQueue } from "@/components/workforce/ApprovalQueue";
import { EmployeeAvatar } from "@/components/workforce/StatusBadge";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { cn } from "@/lib/utils";

type Summary = {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  pendingApprovals: number;
};

type LeaveRequest = {
  id: string; days: number; startDate: string; endDate: string;
  reason?: string | null; status: string; createdAt: string;
  employee: { id: string; firstName: string; lastName: string; avatarUrl?: string | null; department?: { name: string } | null };
  leaveType: { name: string; code: string; color: string };
};

type RecentEmployee = {
  id: string; firstName: string; lastName: string; avatarUrl?: string | null;
  status: string; designation?: { title: string } | null; department?: { name: string } | null;
};
const GLASS_CARD_CLASS = "rounded-2xl border border-zinc-200/60 bg-white/55 shadow-sm backdrop-blur-sm dark:border-zinc-700/50 dark:bg-zinc-950/40 dark:shadow-black/30";

export default function WorkforceOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pendingLeave, setPendingLeave] = useState<LeaveRequest[]>([]);
  const [recent, setRecent] = useState<RecentEmployee[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, leaveRes, empRes] = await Promise.all([
        fetch("/api/workforce/summary"),
        fetch("/api/workforce/leave/requests?status=PENDING"),
        fetch("/api/workforce/employees?limit=6"),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json() as Summary;
        setSummary(data);
      }
      if (leaveRes.ok) {
        const { requests } = await leaveRes.json() as { requests: LeaveRequest[] };
        setPendingLeave(requests);
        setCanApprove(true); // if endpoint returned data, user can see it
      }
      if (empRes.ok) {
        const { employees } = await empRes.json() as { employees: RecentEmployee[] };
        setRecent(employees);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const stats = [
    { label: "Total Employees", value: summary?.totalEmployees ?? 0, icon: Users2, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10 border-teal-500/20" },
    { label: "Active", value: summary?.activeEmployees ?? 0, icon: UserCheck, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "Present Today", value: summary?.presentToday ?? 0, icon: Activity, color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "On Leave Today", value: summary?.onLeaveToday ?? 0, icon: CalendarDays, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { label: "Pending Approvals", value: summary?.pendingApprovals ?? 0, icon: AlertCircle, color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  ];

  return (
    <WorkforcePageShell
      title="Workforce"
      description="People directory, attendance, leave, and approvals — scoped per-workspace."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className={cn(
                "motion-feedback rounded-2xl border p-4 shadow-sm backdrop-blur-sm motion-reduce:transition-none",
                "border-zinc-200/60 bg-white/55 dark:border-zinc-700/50 dark:bg-zinc-950/45",
                bg,
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">{label}</p>
                <Icon className={cn("h-4 w-4 shrink-0", color)} />
              </div>
              <p className={cn("text-2xl font-black tabular-nums", color)}>
                {loading ? <span className="animate-pulse motion-reduce:animate-none text-zinc-400 dark:text-zinc-600">—</span> : value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 ${GLASS_CARD_CLASS} overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <h2 className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">Team Directory</h2>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/workforce/people">
                  <Button
                    id="view-all-employees"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    View All <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
                <Link href="/workforce/people">
                  <Button id="add-employee-btn" size="sm" className="h-8 px-3 text-[11px] bg-teal-600 hover:bg-teal-500 text-white">
                    <Plus className="h-3 w-3 mr-1" /> Add Employee
                  </Button>
                </Link>
              </div>
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3 animate-pulse motion-reduce:animate-none">
                    <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-2.5 w-20 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
                    </div>
                  </div>
                ))
              ) : recent.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Users2 className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">No employees yet.</p>
                  <Link href="/workforce/people">
                    <Button size="sm" className="mt-3 bg-teal-600 hover:bg-teal-500 text-white text-xs">
                      Add your first employee
                    </Button>
                  </Link>
                </div>
              ) : (
                recent.map((emp) => (
                  <Link
                    key={emp.id}
                    href={`/workforce/people/${emp.id}`}
                    className="motion-row-hover flex items-center gap-3 px-5 py-3 hover:bg-white/70 motion-reduce:transition-none dark:hover:bg-zinc-900/50 group"
                  >
                    <EmployeeAvatar firstName={emp.firstName} lastName={emp.lastName} avatarUrl={emp.avatarUrl} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {emp.designation?.title ?? "—"} {emp.department ? `· ${emp.department.name}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="motion-feedback-fast h-4 w-4 text-zinc-300 group-hover:text-zinc-500 motion-reduce:transition-none dark:text-zinc-700 dark:group-hover:text-zinc-400 shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className={`${GLASS_CARD_CLASS} overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">Pending Approvals</h2>
                {pendingLeave.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {pendingLeave.length}
                  </span>
                )}
              </div>
              <Link href="/workforce/leave">
                <Button
                  id="view-all-leave"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  View All <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="rounded-2xl border border-zinc-200/60 bg-white/55 p-4 animate-pulse motion-reduce:animate-none dark:border-zinc-700/50 dark:bg-zinc-950/45">
                      <div className="flex gap-3">
                        <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
                          <div className="h-2.5 w-32 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ApprovalQueue requests={pendingLeave.slice(0, 5)} onRefresh={fetchData} canApprove={canApprove} />
              )}
            </div>
          </div>
        </div>

        <div className={`${GLASS_CARD_CLASS} p-5`}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/workforce/people">
              <Button id="qa-add-employee" size="sm" variant="outline" className="h-8 text-xs gap-2">
                <Plus className="h-3 w-3 text-teal-600 dark:text-teal-400" /> Add Employee
              </Button>
            </Link>
            <Link href="/workforce/attendance">
              <Button id="qa-mark-attendance" size="sm" variant="outline" className="h-8 text-xs gap-2">
                <Clock className="h-3 w-3 text-blue-700 dark:text-blue-400" /> Mark Attendance
              </Button>
            </Link>
            <Link href="/workforce/leave">
              <Button id="qa-request-leave" size="sm" variant="outline" className="h-8 text-xs gap-2">
                <CalendarDays className="h-3 w-3 text-amber-700 dark:text-amber-400" /> Manage Leave
              </Button>
            </Link>
            <Link href="/workforce/reports">
              <Button id="qa-view-reports" size="sm" variant="outline" className="h-8 text-xs gap-2">
                <TrendingUp className="h-3 w-3 text-indigo-700 dark:text-indigo-400" /> View Reports
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </WorkforcePageShell>
  );
}
