"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users2, Plus, Search, Filter, MoreHorizontal,
  Mail, Phone, MapPin, ChevronRight, UserCheck, UserX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, EmployeeAvatar } from "@/components/workforce/StatusBadge";

type Department = { id: string; name: string };
type Designation = { id: string; title: string };
type Manager = { id: string; firstName: string; lastName: string };

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  employeeCode?: string | null;
  status: string;
  joinDate?: string | null;
  department?: Department | null;
  designation?: Designation | null;
  manager?: Manager | null;
};

interface PeopleTableProps {
  employees: Employee[];
  total: number;
  isLoading?: boolean;
  onRefresh: () => void;
  departments: Department[];
}

export function PeopleTable({ employees, total, isLoading, onRefresh, departments }: PeopleTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");

  const handleDeactivate = useCallback(async (id: string, name: string) => {
    const confirmed = confirm(`Deactivate ${name}? Their data will be preserved.`);
    if (!confirmed) return;

    const res = await fetch(`/api/workforce/employees/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${name} deactivated`);
      onRefresh();
    } else {
      toast.error("Failed to deactivate employee");
    }
  }, [onRefresh]);

  const filtered = employees.filter((e) => {
    const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
    const matchSearch = !search || fullName.includes(search.toLowerCase()) ||
      e.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || e.status === statusFilter;
    const matchDept = deptFilter === "ALL" || e.department?.id === deptFilter;
    return matchSearch && matchStatus && matchDept;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            id="people-search"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-zinc-900 border-white/10 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 bg-zinc-900 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-white/10">
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_LEAVE">On Leave</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-44 bg-zinc-900 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-white/10">
              <SelectItem value="ALL">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-zinc-500 ml-auto whitespace-nowrap">
          {filtered.length} of {total} employees
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-zinc-500 text-sm">Loading employees...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Users2 className="h-10 w-10 text-zinc-700" />
            <p className="text-zinc-400 text-sm font-medium">No employees found</p>
            <p className="text-zinc-600 text-xs">Adjust your search or add your first employee.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-zinc-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 hidden md:table-cell">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 hidden lg:table-cell">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 hidden xl:table-cell">Manager</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 hidden lg:table-cell">Location</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((emp) => (
                  <tr
                    key={emp.id}
                    className="group hover:bg-zinc-900/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/workforce/people/${emp.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar firstName={emp.firstName} lastName={emp.lastName} avatarUrl={emp.avatarUrl} size="md" />
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-100 truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {emp.employeeCode && (
                              <span className="text-[10px] text-zinc-600 font-mono">{emp.employeeCode}</span>
                            )}
                            {emp.email && (
                              <span className="text-[11px] text-zinc-500 truncate flex items-center gap-1">
                                <Mail className="h-3 w-3" />{emp.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">
                      {emp.designation?.title ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell">
                      {emp.department?.name ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {emp.manager ? (
                        <span className="text-zinc-400">{emp.manager.firstName} {emp.manager.lastName}</span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={emp.status} variant="employment" />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">
                      {emp.location ? (
                        <span className="flex items-center gap-1 text-xs">
                          <MapPin className="h-3 w-3" />{emp.location}
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            id={`emp-actions-${emp.id}`}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all"
                          >
                            <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
                          <DropdownMenuItem asChild>
                            <Link href={`/workforce/people/${emp.id}`} className="flex items-center gap-2">
                              <ChevronRight className="h-4 w-4" /> View Profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/workforce/people/${emp.id}`} className="flex items-center gap-2">
                              <Mail className="h-4 w-4" /> Send Email
                            </Link>
                          </DropdownMenuItem>
                          {emp.status === "ACTIVE" && (
                            <DropdownMenuItem
                              className="text-rose-400 hover:text-rose-300 focus:text-rose-300"
                              onSelect={() => handleDeactivate(emp.id, `${emp.firstName} ${emp.lastName}`)}
                            >
                              <UserX className="h-4 w-4 mr-2" /> Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
