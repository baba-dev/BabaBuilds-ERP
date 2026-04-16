"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeopleTable } from "@/components/workforce/PeopleTable";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Department = { id: string; name: string };
type Employee = {
  id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null;
  location?: string | null; avatarUrl?: string | null; employeeCode?: string | null; status: string;
  joinDate?: string | null; department?: Department | null;
  designation?: { id: string; title: string } | null;
  manager?: { id: string; firstName: string; lastName: string } | null;
};

export default function PeoplePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", phone: "", departmentId: "", location: "" });
  const [isAdding, setIsAdding] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const [empRes, deptRes] = await Promise.all([
        fetch("/api/workforce/employees?limit=100"),
        fetch("/api/workforce/settings/departments"),
      ]);
      if (empRes.ok) {
        const { employees: emps, total: t } = await empRes.json() as { employees: Employee[]; total: number };
        setEmployees(emps);
        setTotal(t);
      }
      if (deptRes.ok) {
        const { departments: depts } = await deptRes.json() as { departments: Department[] };
        setDepartments(depts);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchEmployees(); }, [fetchEmployees]);

  const handleAddEmployee = async () => {
    if (!addForm.firstName.trim() || !addForm.lastName.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    setIsAdding(true);
    try {
      const res = await fetch("/api/workforce/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: addForm.firstName.trim(),
          lastName: addForm.lastName.trim(),
          email: addForm.email.trim() || undefined,
          phone: addForm.phone.trim() || undefined,
          departmentId: addForm.departmentId || undefined,
          location: addForm.location.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Employee added successfully");
        setShowAddDialog(false);
        setAddForm({ firstName: "", lastName: "", email: "", phone: "", departmentId: "", location: "" });
        void fetchEmployees();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to add employee");
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <WorkforcePageShell
        title="People Directory"
        description="Manage your employee roster, profiles, and org structure."
        actions={
          <>
            <Button id="refresh-employees" variant="ghost" size="sm" onClick={fetchEmployees} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button id="add-employee-people" size="sm" onClick={() => setShowAddDialog(true)} className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-500 text-white border-none">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Employee
            </Button>
          </>
        }
      >
        <PeopleTable
          employees={employees}
          total={total}
          isLoading={isLoading}
          onRefresh={fetchEmployees}
          departments={departments}
        />
      </WorkforcePageShell>

      {/* Add Employee Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>Create a new employee profile in your workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">First Name *</Label>
                <Input
                  id="add-emp-firstname"
                  value={addForm.firstName}
                  onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Last Name *</Label>
                <Input
                  id="add-emp-lastname"
                  value={addForm.lastName}
                  onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                id="add-emp-email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                className="h-9 text-sm"
                placeholder="employee@company.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input
                  id="add-emp-phone"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="+91 9800..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Department</Label>
                <Select value={addForm.departmentId} onValueChange={(v) => setAddForm((f) => ({ ...f, departmentId: v }))}>
                  <SelectTrigger id="add-emp-dept" className="h-9 text-sm">
                    <SelectValue placeholder="Select dept." />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Location / Office</Label>
              <Input
                id="add-emp-location"
                value={addForm.location}
                onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
                className="h-9 text-sm"
                placeholder="e.g. Mumbai HQ, Remote"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)} className="text-muted-foreground">Cancel</Button>
            <Button
              id="confirm-add-employee"
              onClick={handleAddEmployee}
              disabled={isAdding}
              className="bg-teal-600 hover:bg-teal-500 text-white border-none"
            >
              {isAdding ? "Adding..." : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
