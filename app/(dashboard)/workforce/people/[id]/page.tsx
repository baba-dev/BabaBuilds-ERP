"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Building2, User, Edit2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { StatusBadge, EmployeeAvatar } from "@/components/workforce/StatusBadge";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { format } from "date-fns";

type Employee = {
  id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null;
  location?: string | null; avatarUrl?: string | null; employeeCode?: string | null;
  status: string; joinDate?: string | null; exitDate?: string | null;
  notes?: string | null; emergencyName?: string | null; emergencyPhone?: string | null; emergencyRelation?: string | null;
  department?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
  manager?: { id: string; firstName: string; lastName: string; designation?: { title: string } | null } | null;
  directReports?: { id: string; firstName: string; lastName: string; designation?: { title: string } | null }[];
  attendanceRecords?: { id: string; date: string; status: string }[];
  leaveRequests?: { id: string; startDate: string; endDate: string; days: number; status: string; leaveType: { name: string; color: string } }[];
  leaveBalances?: { id: string; entitled: number; used: number; remaining: number; pending: number; year: number; leaveType: { name: string; code: string; color: string } }[];
};

const ATTENDANCE_CELL_COLORS: Record<string, string> = {
  PRESENT:  "bg-emerald-500",
  LATE:     "bg-amber-500",
  ABSENT:   "bg-rose-500",
  HALF_DAY: "bg-orange-400",
  HOLIDAY:  "bg-blue-500",
  REMOTE:   "bg-indigo-500",
};

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const id = params.id as string;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);

  const fetchEmployee = useCallback(async () => {
    const res = await fetch(`/api/workforce/employees/${id}`);
    if (res.ok) {
      const data = await res.json() as Employee;
      setEmployee(data);
      setEditForm(data);
    } else {
      toast.error("Employee not found");
      router.push("/workforce/people");
    }
    setLoading(false);
  }, [id, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only state sync after mount (avoids SSR hydration mismatch)
  useEffect(() => { void fetchEmployee(); }, [fetchEmployee]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/workforce/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: editForm.firstName, lastName: editForm.lastName,
        email: editForm.email, phone: editForm.phone, location: editForm.location,
        notes: editForm.notes, emergencyName: editForm.emergencyName,
        emergencyPhone: editForm.emergencyPhone, emergencyRelation: editForm.emergencyRelation,
      }),
    });
    if (res.ok) {
      toast.success("Profile updated");
      setEditing(false);
      void fetchEmployee();
    } else {
      toast.error("Failed to save changes");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="flex gap-4 items-center">
          <div className="h-16 w-16 rounded-full bg-zinc-800" />
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-zinc-800" />
            <div className="h-3 w-32 rounded bg-zinc-800/60" />
          </div>
        </div>
      </div>
    );
  }

  if (!employee) return null;

  const tenure = employee.joinDate
    ? Math.floor((now - new Date(employee.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  return (
    <WorkforcePageShell
      title={`${employee.firstName} ${employee.lastName}`}
      description={employee.designation?.title ?? undefined}
      actions={
        <Button
          id="back-to-people"
          variant="outline"
          size="sm"
          onClick={() => router.push("/workforce/people")}
          className="h-8 gap-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          People Directory
        </Button>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Profile Header */}
        <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <EmployeeAvatar firstName={employee.firstName} lastName={employee.lastName} avatarUrl={employee.avatarUrl} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{employee.firstName} {employee.lastName}</h2>
                  <StatusBadge status={employee.status} variant="employment" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                  {employee.designation && <span className="font-medium text-zinc-700 dark:text-zinc-200">{employee.designation.title}</span>}
                  {employee.department && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{employee.department.name}</span>}
                  {employee.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{employee.location}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-zinc-500">
                  {employee.employeeCode && <span className="font-mono">{employee.employeeCode}</span>}
                  {employee.joinDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Joined {format(new Date(employee.joinDate), "MMM d, yyyy")}</span>}
                  {tenure !== null && <span>{tenure} months tenure</span>}
                </div>
              </div>
              <Button
                id="edit-employee-btn"
                size="sm"
                variant={editing ? "ghost" : "outline"}
                onClick={() => { if (editing) { setEditing(false); setEditForm(employee); } else setEditing(true); }}
                className="h-8 text-xs"
              >
                {editing ? <><X className="h-3.5 w-3.5 mr-1" /> Cancel</> : <><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</>}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-white/50 dark:bg-zinc-900/20 border border-zinc-200/60 dark:border-zinc-800/60 h-9">
          {["overview", "attendance", "leave"].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="text-xs capitalize data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact */}
            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-5 space-y-4 shadow-sm backdrop-blur-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Contact Information</h3>
              {editing ? (
                <div className="space-y-3">
                  <div className="space-y-1"><Label className="text-xs text-zinc-400">Email</Label>
                    <Input id="edit-email" value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="h-8 text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs text-zinc-400">Phone</Label>
                    <Input id="edit-phone" value={editForm.phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className="h-8 text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs text-zinc-400">Location</Label>
                    <Input id="edit-location" value={editForm.location ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} className="h-8 text-sm" /></div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {employee.email && <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200"><Mail className="h-4 w-4 text-zinc-500" />{employee.email}</div>}
                  {employee.phone && <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200"><Phone className="h-4 w-4 text-zinc-500" />{employee.phone}</div>}
                  {employee.location && <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200"><MapPin className="h-4 w-4 text-zinc-500" />{employee.location}</div>}
                  {!employee.email && !employee.phone && <p className="text-zinc-600 text-xs">No contact info</p>}
                </div>
              )}
            </div>

            {/* Manager + Direct Reports */}
            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-5 space-y-4 shadow-sm backdrop-blur-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Reporting Structure</h3>
              {employee.manager ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Reports To</p>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium">{employee.manager.firstName} {employee.manager.lastName}</span>
                    {employee.manager.designation && <span className="text-zinc-500">· {employee.manager.designation.title}</span>}
                  </div>
                </div>
              ) : <p className="text-zinc-600 text-xs">No manager assigned</p>}
              {employee.directReports && employee.directReports.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Direct Reports ({employee.directReports.length})</p>
                  <div className="space-y-1">
                    {employee.directReports.slice(0, 4).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <div className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                        {r.firstName} {r.lastName}{r.designation ? ` · ${r.designation.title}` : ""}
                      </div>
                    ))}
                    {employee.directReports.length > 4 && <p className="text-xs text-zinc-600">+{employee.directReports.length - 4} more</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {editing && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditForm(employee); }}>Cancel</Button>
              <Button id="save-employee" size="sm" onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-500 text-white border-none">
                <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="mt-4">
          <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-5 shadow-sm backdrop-blur-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Last 30 Days</h3>
            {employee.attendanceRecords && employee.attendanceRecords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {employee.attendanceRecords.map((rec) => (
                  <div key={rec.id} className="group relative">
                    <div className={`h-7 w-7 rounded-md ${ATTENDANCE_CELL_COLORS[rec.status] ?? "bg-zinc-700"} opacity-80 hover:opacity-100 transition-opacity cursor-default`} />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex items-center gap-1 bg-white border border-zinc-200 rounded px-2 py-1 text-[10px] text-zinc-700 whitespace-nowrap z-10 shadow-lg dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200">
                      {format(new Date(rec.date), "MMM d")} · {rec.status}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-600 text-sm">No attendance records for this period.</p>
            )}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60">
              {Object.entries(ATTENDANCE_CELL_COLORS).map(([key, color]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`h-3 w-3 rounded-sm ${color}`} />
                  <span className="text-[11px] text-zinc-500 capitalize">{key.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Leave Tab */}
        <TabsContent value="leave" className="mt-4 space-y-4">
          {/* Leave Balances */}
          {employee.leaveBalances && employee.leaveBalances.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {employee.leaveBalances.map((b) => (
                <div key={b.id} className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-4 shadow-sm backdrop-blur-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">{b.leaveType.name}</p>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{b.remaining}<span className="text-sm font-normal text-zinc-500">/{b.entitled}</span></p>
                  <p className="text-xs text-zinc-600 mt-1">days remaining</p>
                </div>
              ))}
            </div>
          )}
          {/* Leave History */}
          {employee.leaveRequests && (
            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">Leave History</h3>
              {employee.leaveRequests.length === 0 ? (
                <p className="text-zinc-600 text-sm px-5 py-8">No leave requests yet.</p>
              ) : (
                <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {employee.leaveRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-zinc-400">
                          {format(new Date(req.startDate), "MMM d")} — {format(new Date(req.endDate), "MMM d, yyyy")}
                        </div>
                        <span className="text-xs text-zinc-500">{req.leaveType.name} · {req.days}d</span>
                      </div>
                      <StatusBadge status={req.status} variant="leave" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </WorkforcePageShell>
  );
}
