"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─── Status Badge for Employment Status ───────────────────────────────────
const EMPLOYMENT_COLORS: Record<string, string> = {
  ACTIVE:   "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  ON_LEAVE: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  INACTIVE: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20",
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  ACTIVE: "Active", ON_LEAVE: "On Leave", INACTIVE: "Inactive",
};

// ─── Status Badge for Attendance ──────────────────────────────────────────
const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT:  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  LATE:     "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  ABSENT:   "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  HALF_DAY: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20",
  HOLIDAY:  "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  REMOTE:   "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
};
const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Present", LATE: "Late", ABSENT: "Absent",
  HALF_DAY: "Half Day", HOLIDAY: "Holiday", REMOTE: "Remote",
};

// ─── Status Badge for Leave Requests ──────────────────────────────────────
const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING:   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  APPROVED:  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  REJECTED:  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  CANCELLED: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20",
};
const LEAVE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled",
};

type BadgeVariant = "employment" | "attendance" | "leave";

export function StatusBadge({
  status,
  variant,
  className,
}: {
  status: string;
  variant: BadgeVariant;
  className?: string;
}) {
  const colorMap = variant === "employment" ? EMPLOYMENT_COLORS : variant === "attendance" ? ATTENDANCE_COLORS : LEAVE_STATUS_COLORS;
  const labelMap = variant === "employment" ? EMPLOYMENT_LABELS : variant === "attendance" ? ATTENDANCE_LABELS : LEAVE_STATUS_LABELS;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        colorMap[status] ?? "bg-zinc-100 text-zinc-500 border border-zinc-200",
        className,
      )}
    >
      {labelMap[status] ?? status}
    </span>
  );
}

// ─── Employee Avatar ───────────────────────────────────────────────────────
export function EmployeeAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const sizeClasses: Record<string, string> = {
    sm:  "h-7 w-7 text-[10px]",
    md:  "h-9 w-9 text-xs",
    lg:  "h-12 w-12 text-sm",
    xl:  "h-16 w-16 text-base",
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        className={cn("rounded-full object-cover", sizeClasses[size])}
      />
    );
  }

  // Deterministic gradient from name
  const colors = [
    "from-indigo-500 to-blue-500",
    "from-purple-500 to-indigo-500",
    "from-teal-500 to-emerald-500",
    "from-amber-500 to-orange-500",
    "from-rose-500 to-pink-500",
  ];
  const colorIdx = (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length;

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center font-bold text-white shrink-0",
        sizeClasses[size],
        colors[colorIdx],
      )}
    >
      {initials}
    </div>
  );
}

// ─── Wrapper: children only shown when module is enabled ──────────────────
export function ModuleWidgetWrapper({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  if (!enabled) return null;
  return <>{children}</>;
}
