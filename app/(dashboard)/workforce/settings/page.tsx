"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Building2, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { toast } from "sonner";

type Department = { id: string; name: string; description?: string | null; _count?: { employees: number } };

export default function WorkforceSettingsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDepartments = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch("/api/workforce/settings/departments");
    if (res.ok) {
      const { departments: depts } = await res.json() as { departments: Department[] };
      setDepartments(depts);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchDepartments(); }, [fetchDepartments]);

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
      void fetchDepartments();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to add department");
    }
    setAdding(false);
  };

  return (
    <WorkforcePageShell
      title="Workforce Settings"
      description="Configure departments, designations, holidays, and work schedule."
    >
      <div className="max-w-2xl space-y-8">
        {/* Departments */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
            <Building2 className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Departments</h3>
            <span className="ml-auto text-xs text-zinc-600">{departments.length} total</span>
          </div>

          <div className="divide-y divide-white/5">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3 animate-pulse">
                  <div className="h-3 w-32 rounded bg-zinc-800" />
                </div>
              ))
            ) : departments.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-600 text-sm">No departments yet.</div>
            ) : (
              departments.map((dept) => (
                <div key={dept.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{dept.name}</p>
                    {dept.description && <p className="text-xs text-zinc-500">{dept.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-600">{dept._count?.employees ?? 0} employees</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Department Form */}
          <div className="border-t border-white/5 px-5 py-4 bg-zinc-950/30">
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-zinc-400">Department Name</Label>
                <Input
                  id="new-dept-name"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleAddDept(); }}
                  placeholder="e.g. Product"
                  className="h-8 bg-zinc-900 border-white/10 text-sm"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-zinc-400">Description (optional)</Label>
                <Input
                  id="new-dept-desc"
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Short description..."
                  className="h-8 bg-zinc-900 border-white/10 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  id="add-dept-btn"
                  size="sm"
                  onClick={handleAddDept}
                  disabled={adding || !newDeptName.trim()}
                  className="h-8 bg-teal-600 hover:bg-teal-500 text-white border-none"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> {adding ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Leave Policies placeholder */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-400">Leave Policies, Designations &amp; Holidays</h3>
          </div>
          <p className="text-xs text-zinc-600">
            Full configuration for designations, leave quotas, holiday calendars, and work schedules is coming in the next update.
            Default values were applied when you enabled the Workforce module.
          </p>
        </div>
      </div>
    </WorkforcePageShell>
  );
}
