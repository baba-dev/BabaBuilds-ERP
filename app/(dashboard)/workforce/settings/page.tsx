"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Building2, Briefcase, Users2, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Department = { id: string; name: string; description?: string | null; _count?: { employees: number } };
type Designation = { id: string; title: string; level?: number | null; _count?: { employees: number } };
type LeaveType = { id: string; name: string; code: string; description?: string | null; color: string; defaultDays: number; isPaid: boolean; isActive: boolean };
type Holiday = { id: string; name: string; date: string; isRecurring: boolean; year?: number | null };
type WorkSchedule = { workingDays: string; workStartTime: string; workEndTime: string; timeZone: string };

export default function WorkforceSettingsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [designations, setDesignations] = useState<Designation[]>([]);
  const [newDesigTitle, setNewDesigTitle] = useState("");
  const [newDesigLevel, setNewDesigLevel] = useState<string>("");
  const [addingDesignation, setAddingDesignation] = useState(false);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [newLeaveType, setNewLeaveType] = useState({
    name: "",
    code: "",
    color: "indigo",
    defaultDays: "0",
    isPaid: true,
  });
  const [addingLeaveType, setAddingLeaveType] = useState(false);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "", isRecurring: true });
  const [addingHoliday, setAddingHoliday] = useState(false);

  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [deptRes, desigRes, leaveRes, holRes, schedRes] = await Promise.all([
        fetch("/api/workforce/settings/departments"),
        fetch("/api/workforce/settings/designations"),
        fetch("/api/workforce/settings/leave-types"),
        fetch(`/api/workforce/settings/holidays?year=${new Date().getFullYear()}`),
        fetch("/api/workforce/settings/schedule"),
      ]);
      if (deptRes.ok) {
        const { departments: depts } = await deptRes.json() as { departments: Department[] };
        setDepartments(depts);
      }
      if (desigRes.ok) {
        const { designations: ds } = await desigRes.json() as { designations: Designation[] };
        setDesignations(ds);
      }
      if (leaveRes.ok) {
        const { leaveTypes: lts } = await leaveRes.json() as { leaveTypes: LeaveType[] };
        setLeaveTypes(lts);
      }
      if (holRes.ok) {
        const { holidays: hs } = await holRes.json() as { holidays: Holiday[] };
        setHolidays(hs);
      }
      if (schedRes.ok) {
        const { schedule: s } = await schedRes.json() as { schedule: WorkSchedule | null };
        setSchedule(s);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleAddDept = async () => {
    if (!newDeptName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/workforce/settings/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDeptName.trim(), description: newDeptDesc.trim() || undefined }),
    });
    if (res.ok) {
      toast.success("Department added");
      setNewDeptName("");
      setNewDeptDesc("");
      void fetchAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to add department");
    }
    setAdding(false);
  };

  const handleAddDesignation = async () => {
    if (!newDesigTitle.trim()) return;
    setAddingDesignation(true);
    try {
      const level = newDesigLevel.trim() ? Number(newDesigLevel) : undefined;
      const res = await fetch("/api/workforce/settings/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newDesigTitle.trim(), level: Number.isFinite(level) ? level : undefined }),
      });
      if (res.ok) {
        toast.success("Designation added");
        setNewDesigTitle("");
        setNewDesigLevel("");
        void fetchAll();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to add designation");
      }
    } finally {
      setAddingDesignation(false);
    }
  };

  const handleAddLeaveType = async () => {
    if (!newLeaveType.name.trim() || !newLeaveType.code.trim()) return;
    setAddingLeaveType(true);
    try {
      const res = await fetch("/api/workforce/settings/leave-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLeaveType.name.trim(),
          code: newLeaveType.code.trim().toUpperCase(),
          color: newLeaveType.color,
          defaultDays: Math.max(0, Math.round(Number(newLeaveType.defaultDays) || 0)),
          isPaid: newLeaveType.isPaid,
          isActive: true,
        }),
      });
      if (res.ok) {
        toast.success("Leave type added");
        setNewLeaveType({ name: "", code: "", color: "indigo", defaultDays: "0", isPaid: true });
        void fetchAll();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to add leave type");
      }
    } finally {
      setAddingLeaveType(false);
    }
  };

  const handleToggleLeaveType = async (lt: LeaveType, patch: Partial<Pick<LeaveType, "isActive" | "isPaid" | "defaultDays" | "color">>) => {
    const res = await fetch(`/api/workforce/settings/leave-types/${lt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      void fetchAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to update leave type");
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.name.trim() || !newHoliday.date) return;
    setAddingHoliday(true);
    try {
      const res = await fetch("/api/workforce/settings/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newHoliday, name: newHoliday.name.trim() }),
      });
      if (res.ok) {
        toast.success("Holiday added");
        setNewHoliday({ name: "", date: "", isRecurring: true });
        void fetchAll();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to add holiday");
      }
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    const res = await fetch(`/api/workforce/settings/holidays/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Holiday deleted");
      void fetchAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete holiday");
    }
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/workforce/settings/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (res.ok) {
        toast.success("Schedule saved");
        void fetchAll();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save schedule");
      }
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <WorkforcePageShell
      title="Workforce Settings"
      description="Configure departments, designations, holidays, and work schedule."
    >
      <div className="space-y-8">
        {/* Departments */}
        <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Departments</h3>
            <span className="ml-auto text-xs text-zinc-500">{departments.length} total</span>
          </div>

          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3 animate-pulse">
                  <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))
            ) : departments.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-500 text-sm">No departments yet.</div>
            ) : (
              departments.map((dept) => (
                <div key={dept.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{dept.name}</p>
                    {dept.description && <p className="text-xs text-zinc-500 dark:text-zinc-400">{dept.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{dept._count?.employees ?? 0} employees</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Department Form */}
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 px-5 py-4 bg-white/30 dark:bg-zinc-950/20">
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">Department Name</Label>
                <Input
                  id="new-dept-name"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleAddDept(); }}
                  placeholder="e.g. Product"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">Description (optional)</Label>
                <Input
                  id="new-dept-desc"
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Short description..."
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  id="add-dept-btn"
                  size="sm"
                  onClick={handleAddDept}
                  disabled={adding || !newDeptName.trim()}
                  className="h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> {adding ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Designations */}
          <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <Users2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Designations</h3>
              <span className="ml-auto text-xs text-zinc-500">{designations.length} total</span>
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 animate-pulse">
                    <div className="h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                ))
              ) : designations.length === 0 ? (
                <div className="px-5 py-8 text-center text-zinc-500 text-sm">No designations yet.</div>
              ) : (
                designations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{d.title}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Level {d.level ?? "—"}</p>
                    </div>
                    <span className="text-xs text-zinc-500">{d._count?.employees ?? 0} employees</span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 px-5 py-4 bg-white/30 dark:bg-zinc-950/20">
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Title</Label>
                  <Input
                    id="new-desig-title"
                    value={newDesigTitle}
                    onChange={(e) => setNewDesigTitle(e.target.value)}
                    placeholder="e.g. Senior Associate"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-28 space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Level</Label>
                  <Input
                    id="new-desig-level"
                    value={newDesigLevel}
                    onChange={(e) => setNewDesigLevel(e.target.value)}
                    placeholder="3"
                    inputMode="numeric"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    id="add-desig-btn"
                    size="sm"
                    onClick={handleAddDesignation}
                    disabled={addingDesignation || !newDesigTitle.trim()}
                    className="h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> {addingDesignation ? "Adding..." : "Add"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Leave Types */}
          <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <Briefcase className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Leave Types</h3>
              <span className="ml-auto text-xs text-zinc-500">{leaveTypes.length} total</span>
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 animate-pulse">
                    <div className="h-3 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                ))
              ) : leaveTypes.length === 0 ? (
                <div className="px-5 py-8 text-center text-zinc-500 text-sm">No leave types yet.</div>
              ) : (
                leaveTypes.map((lt) => (
                  <div key={lt.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {lt.name} <span className="text-xs text-zinc-500">({lt.code})</span>
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {lt.defaultDays} days · {lt.isPaid ? "Paid" : "Unpaid"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Active</span>
                        <Switch
                          checked={lt.isActive}
                          onCheckedChange={(v) => handleToggleLeaveType(lt, { isActive: v })}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 px-5 py-4 bg-white/30 dark:bg-zinc-950/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Name</Label>
                  <Input
                    id="new-leave-name"
                    value={newLeaveType.name}
                    onChange={(e) => setNewLeaveType((s) => ({ ...s, name: e.target.value }))}
                    placeholder="e.g. Annual Leave"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Code</Label>
                  <Input
                    id="new-leave-code"
                    value={newLeaveType.code}
                    onChange={(e) => setNewLeaveType((s) => ({ ...s, code: e.target.value }))}
                    placeholder="e.g. AL"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Default days</Label>
                  <Input
                    id="new-leave-days"
                    value={newLeaveType.defaultDays}
                    onChange={(e) => setNewLeaveType((s) => ({ ...s, defaultDays: e.target.value }))}
                    placeholder="0"
                    inputMode="numeric"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Color</Label>
                  <Select value={newLeaveType.color} onValueChange={(v) => setNewLeaveType((s) => ({ ...s, color: v }))}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["emerald", "rose", "amber", "zinc", "indigo", "blue"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newLeaveType.isPaid} onCheckedChange={(v) => setNewLeaveType((s) => ({ ...s, isPaid: v }))} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Paid leave</span>
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    id="add-leave-type-btn"
                    size="sm"
                    onClick={handleAddLeaveType}
                    disabled={addingLeaveType || !newLeaveType.name.trim() || !newLeaveType.code.trim()}
                    className="h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> {addingLeaveType ? "Adding..." : "Add"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Holidays */}
          <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Holidays</h3>
              <span className="ml-auto text-xs text-zinc-500">{holidays.length} in {new Date().getFullYear()}</span>
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 animate-pulse">
                    <div className="h-3 w-44 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                ))
              ) : holidays.length === 0 ? (
                <div className="px-5 py-8 text-center text-zinc-500 text-sm">No holidays found.</div>
              ) : (
                holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{h.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {h.isRecurring ? "Recurring" : "One-off"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 text-rose-600 dark:text-rose-400" onClick={() => handleDeleteHoliday(h.id)}>
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 px-5 py-4 bg-white/30 dark:bg-zinc-950/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Name</Label>
                  <Input
                    id="new-holiday-name"
                    value={newHoliday.name}
                    onChange={(e) => setNewHoliday((s) => ({ ...s, name: e.target.value }))}
                    placeholder="e.g. Diwali"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">Date</Label>
                  <Input
                    id="new-holiday-date"
                    type="date"
                    value={newHoliday.date}
                    onChange={(e) => setNewHoliday((s) => ({ ...s, date: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newHoliday.isRecurring} onCheckedChange={(v) => setNewHoliday((s) => ({ ...s, isRecurring: v }))} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Recurring yearly</span>
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    id="add-holiday-btn"
                    size="sm"
                    onClick={handleAddHoliday}
                    disabled={addingHoliday || !newHoliday.name.trim() || !newHoliday.date}
                    className="h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> {addingHoliday ? "Adding..." : "Add"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Work schedule */}
          <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 overflow-hidden shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Work schedule</h3>
            </div>
            <div className="p-5 space-y-4">
              {!schedule ? (
                <p className="text-sm text-zinc-500">Schedule not configured yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-600 dark:text-zinc-400">Start</Label>
                      <Input
                        id="schedule-start"
                        value={schedule.workStartTime}
                        onChange={(e) => setSchedule((s) => (s ? { ...s, workStartTime: e.target.value } : s))}
                        placeholder="09:00"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-600 dark:text-zinc-400">End</Label>
                      <Input
                        id="schedule-end"
                        value={schedule.workEndTime}
                        onChange={(e) => setSchedule((s) => (s ? { ...s, workEndTime: e.target.value } : s))}
                        placeholder="18:00"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-xs text-zinc-600 dark:text-zinc-400">Working days (JSON)</Label>
                      <Input
                        id="schedule-days"
                        value={schedule.workingDays}
                        onChange={(e) => setSchedule((s) => (s ? { ...s, workingDays: e.target.value } : s))}
                        className="h-8 text-sm font-mono"
                      />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Example: ["MON","TUE","WED","THU","FRI"]</p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-xs text-zinc-600 dark:text-zinc-400">Time zone</Label>
                      <Input
                        id="schedule-tz"
                        value={schedule.timeZone}
                        onChange={(e) => setSchedule((s) => (s ? { ...s, timeZone: e.target.value } : s))}
                        placeholder="Asia/Kolkata"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button id="save-schedule-btn" size="sm" onClick={handleSaveSchedule} disabled={savingSchedule} className="h-8">
                      {savingSchedule ? "Saving..." : "Save schedule"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkforcePageShell>
  );
}
