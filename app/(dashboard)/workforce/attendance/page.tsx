"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, EmployeeAvatar } from "@/components/workforce/StatusBadge";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { toast } from "sonner";

type AttendanceRecord = {
  id: string; date: string; status: string; checkInAt?: string | null;
  notes?: string | null;
  employee: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
};
type Employee = { id: string; firstName: string; lastName: string; avatarUrl?: string | null };

const STATUS_COLORS: Record<string, string> = {
  PRESENT:  "bg-emerald-500/80 hover:bg-emerald-500",
  LATE:     "bg-amber-500/80 hover:bg-amber-500",
  ABSENT:   "bg-rose-500/80 hover:bg-rose-500",
  HALF_DAY: "bg-orange-500/80 hover:bg-orange-500",
  HOLIDAY:  "bg-blue-500/80 hover:bg-blue-500",
  REMOTE:   "bg-indigo-500/80 hover:bg-indigo-500",
};

export default function AttendancePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = format(monthStart, "yyyy-MM-dd");
      const to = format(monthEnd, "yyyy-MM-dd");
      const empFilter = selectedEmployee !== "ALL" ? `&employeeId=${selectedEmployee}` : "";

      const [attRes, empRes] = await Promise.all([
        fetch(`/api/workforce/attendance?from=${from}&to=${to}${empFilter}`),
        fetch("/api/workforce/employees?limit=50"),
      ]);

      if (attRes.ok) {
        const { records: recs } = await attRes.json() as { records: AttendanceRecord[] };
        setRecords(recs);
      }
      if (empRes.ok) {
        const { employees: emps } = await empRes.json() as { employees: Employee[] };
        setEmployees(emps);
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, selectedEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSelfCheckIn = async () => {
    setCheckingIn(true);
    try {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const res = await fetch("/api/workforce/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayStr, status: "PRESENT", checkInAt: new Date().toISOString() }),
      });
      if (res.ok) {
        toast.success("Checked in for today!");
        void fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Check-in failed");
      }
    } finally {
      setCheckingIn(false);
    }
  };

  // Build lookup: employeeId → date string → status
  const lookup = new Map<string, Map<string, string>>();
  for (const rec of records) {
    const dateKey = format(new Date(rec.date), "yyyy-MM-dd");
    if (!lookup.has(rec.employee.id)) lookup.set(rec.employee.id, new Map());
    lookup.get(rec.employee.id)!.set(dateKey, rec.status);
  }

  const displayEmployees = selectedEmployee === "ALL" ? employees : employees.filter((e) => e.id === selectedEmployee);

  return (
    <WorkforcePageShell
      title="Attendance"
      description="Track daily attendance across your team."
      actions={
        <>
          <Button
            id="self-checkin-btn"
            size="sm"
            onClick={handleSelfCheckIn}
            disabled={checkingIn}
            className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-500 text-white border-none"
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {checkingIn ? "Checking in..." : "Check In Today"}
          </Button>
        </>
      }
    >
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Button
            id="prev-month-btn"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
            className="h-8 w-8 p-0 text-zinc-400"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-zinc-200 min-w-[120px] text-center">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <Button
            id="next-month-btn"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
            className="h-8 w-8 p-0 text-zinc-400"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="h-8 w-48 bg-zinc-900 border-white/10 text-sm">
            <SelectValue placeholder="All employees" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-white/10">
            <SelectItem value="ALL">All Employees</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 ml-auto">
          {Object.entries(STATUS_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={`h-2.5 w-2.5 rounded-sm ${color.split(" ")[0]}`} />
              <span className="text-[10px] text-zinc-500 capitalize">{key.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-white/5 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-900/60 border-b border-white/5">
              <th className="px-4 py-3 text-left font-semibold text-zinc-500 w-48 sticky left-0 bg-zinc-900/60">Employee</th>
              {days.map((day) => (
                <th
                  key={day.toISOString()}
                  className={`px-1 py-3 text-center font-medium min-w-[36px] ${isToday(day) ? "text-teal-400" : "text-zinc-600"}`}
                >
                  <div>{format(day, "d")}</div>
                  <div className="text-[9px]">{format(day, "EEE")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3 sticky left-0 bg-zinc-950">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-zinc-800" />
                      <div className="h-3 w-24 rounded bg-zinc-800" />
                    </div>
                  </td>
                  {days.map((d) => (
                    <td key={d.toISOString()} className="px-1 py-3">
                      <div className="h-6 w-6 rounded bg-zinc-800/40 mx-auto" />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayEmployees.length === 0 ? (
              <tr><td colSpan={days.length + 1} className="text-center py-12 text-zinc-600">No employees to display</td></tr>
            ) : (
              displayEmployees.map((emp) => {
                const empRecords = lookup.get(emp.id) ?? new Map();
                return (
                  <tr key={emp.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-zinc-950 hover:bg-zinc-900/30">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar firstName={emp.firstName} lastName={emp.lastName} avatarUrl={emp.avatarUrl} size="sm" />
                        <span className="font-medium text-zinc-300 truncate max-w-[120px]">{emp.firstName} {emp.lastName}</span>
                      </div>
                    </td>
                    {days.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const status = empRecords.get(key);
                      return (
                        <td key={key} className="px-1 py-3">
                          <div
                            title={status ?? "No record"}
                            className={`h-6 w-6 rounded-md mx-auto transition-all cursor-default ${
                              status ? `${STATUS_COLORS[status] ?? "bg-zinc-700"} cursor-pointer` : isToday(day) ? "border-2 border-dashed border-zinc-700" : "bg-zinc-800/20"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </WorkforcePageShell>
  );
}
