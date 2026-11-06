"use client";

import React from "react";
/**
 * app/(dashboard)/settings/team/page.tsx
 *
 * Premium 5-tab Team & Access Management interface.
 *
 * Tabs:
 *   1. Members — member list with inline role editing, deactivate/remove
 *   2. Roles & Permissions — permission matrix (read-only matrix for non-owners)
 *   3. Seats / Plan — visual seat meter with pending invite breakdown
 *   4. Access Activity — paginated RbacAuditLog timeline
 *   5. Governance — SoD readiness (informational only in Phase 1)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, Shield, LayoutGrid, Activity, Scale, UserPlus, MoreHorizontal, Check, X, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, ShieldAlert, UserMinus, UserCheck, Loader2, Mail, Crown, RefreshCw, Info, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BUSINESS_ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_BADGE_COLORS,
  PERMISSION_MODULE_GROUPS,
  DEFAULT_ROLE_PERMISSIONS,
  type BusinessRole,
  type Permission,
  canAssignRole,
} from "@/lib/permissions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  businessRole: BusinessRole;
  roleLabel: string;
  isActive: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  user: { name: string | null; email: string | null; image: string | null };
};

type InviteRow = {
  id: string;
  email: string;
  businessRole: BusinessRole;
  roleLabel: string;
  expiresAt: string;
  createdAt: string;
};

type SeatData = {
  activeMembers: number;
  pendingInvites: number;
  used: number;
  limit: number;
  limitDisplay: string;
  available: number;
  availableDisplay: string;
  canInvite: boolean;
  planTier: string;
  atWarningThreshold: boolean;
  atLimit: boolean;
};

type AccessLogEntry = {
  id: string;
  eventType: string;
  actorEmail: string | null;
  targetEmail: string | null;
  previousRole: string | null;
  newRole: string | null;
  previousRoleLabel: string | null;
  newRoleLabel: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

type TeamData = {
  currentUserRole: string;
  currentBusinessRole: BusinessRole;
  currentRoleLabel: string;
  grantedPermissions: Record<Permission, boolean>;
  members: MemberRow[];
  invites: InviteRow[];
};

type Tab = "members" | "roles" | "seats" | "activity" | "governance";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function RoleBadge({ role, className }: { role: BusinessRole; className?: string }) {
  const colors = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.VIEWER;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
        colors.bg, colors.text, colors.border, className,
      )}
    >
      {role === "OWNER" && <Crown className="w-3 h-3" />}
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function Initials({ name, email, image }: { name: string | null; email: string | null; image?: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- dynamic or user-supplied image source; next/image remote config not applicable
    return <img src={image} alt={name ?? email ?? "User"} className="w-8 h-8 rounded-full object-cover" />;
  }
  const label = name
    ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : email?.slice(0, 2).toUpperCase() ?? "??";
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
      {label}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

const EVENT_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  invite_sent:        { icon: Mail,        color: "text-blue-500",   label: "Invite Sent" },
  invite_accepted:    { icon: UserCheck,   color: "text-emerald-500", label: "Invite Accepted" },
  invite_cancelled:   { icon: X,           color: "text-zinc-400",   label: "Invite Cancelled" },
  role_changed:       { icon: RefreshCw,   color: "text-indigo-500", label: "Role Changed" },
  member_removed:     { icon: UserMinus,   color: "text-rose-500",   label: "Member Removed" },
  member_deactivated: { icon: ShieldAlert, color: "text-amber-500",  label: "Member Deactivated" },
  member_reactivated: { icon: UserCheck,   color: "text-emerald-500", label: "Member Reactivated" },
  seat_limit_hit:     { icon: AlertTriangle, color: "text-amber-500", label: "Seat Limit Hit" },
  rbac_access_denied: { icon: Shield,      color: "text-rose-500",   label: "Access Denied" },
  owner_safeguard_blocked: { icon: Crown,  color: "text-violet-500", label: "Owner Safeguard" },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function TeamAccessPage() {
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [seatData, setSeatData] = useState<SeatData | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<BusinessRole | "ALL">("ALL");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BusinessRole>("STAFF");
  const [inviteLoading, setInviteLoading] = useState(false);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/members", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to load team");
      setTeamData(payload.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSeats = useCallback(async () => {
    setSeatsLoading(true);
    try {
      const res = await fetch("/api/team/seats", { cache: "no-store" });
      const payload = await res.json();
      if (res.ok) setSeatData(payload.data);
    } catch {
      // silent fail — seat data is supplementary
    } finally {
      setSeatsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/team/access-log?page=${page}&limit=15`);
      const payload = await res.json();
      if (res.ok) {
        setAccessLogs(payload.data);
        setLogsTotal(payload.meta.totalRecords);
        setLogsPage(page);
      }
    } catch {
      // silent fail
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchTeam(); void fetchSeats(); }, [fetchTeam, fetchSeats]);
  useEffect(() => {
    if (activeTab === "activity") void fetchLogs(1);
  }, [activeTab, fetchLogs]);

  // ─── Derived state ───────────────────────────────────────────────────────

  const currentRole = teamData?.currentBusinessRole;
  const canManageMembers = teamData?.grantedPermissions?.["workspace.manage_members"] ?? false;
  const canManageRoles = teamData?.grantedPermissions?.["workspace.manage_roles"] ?? false;

  const filteredMembers = useMemo(() => {
    if (!teamData) return [];
    return teamData.members.filter((m) => {
      const matchSearch = !search ||
        m.user.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.user.email?.toLowerCase().includes(search.toLowerCase()) ||
        m.businessRole.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "ALL" || m.businessRole === roleFilter;
      return matchSearch && matchRole;
    });
  }, [teamData, search, roleFilter]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    const tid = toast.loading("Sending invite...");
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, businessRole: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invite");
      if (res.status === 202) {
        toast.warning(data.error || "Invite created but email delivery failed.", { id: tid });
      } else {
        toast.success("Invitation sent successfully", { id: tid });
      }
      if (data.seatWarning) toast.warning(data.seatWarning);
      setInviteEmail("");
      if (res.status !== 202) {
        setInviteOpen(false);
      }
      void fetchTeam();
      void fetchSeats();
    } catch (err: any) {
      toast.error(err.message, { id: tid });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: BusinessRole) => {
    setActionLoading(userId);
    const tid = toast.loading("Updating role...");
    try {
      const res = await fetch("/api/team/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId, newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change role");
      toast.success("Role updated", { id: tid });
      void fetchTeam();
    } catch (err: any) {
      toast.error(err.message, { id: tid });
    } finally {
      setActionLoading(null);
    }
  };

  const handleMemberAction = async (
    userId: string,
    action: "remove" | "deactivate",
    name: string,
  ) => {
    const labelMap = { remove: "Remove", deactivate: "Deactivate" };
    setActionLoading(userId);
    const tid = toast.loading(`${labelMap[action]}ing ${name}...`);
    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      toast.success(`${name} ${action}d successfully`, { id: tid });
      void fetchTeam();
      void fetchSeats();
    } catch (err: any) {
      toast.error(err.message, { id: tid });
    } finally {
      setActionLoading(null);
    }
  };

  const handleInviteCancel = async (inviteId: string, _email: string) => {
    const tid = toast.loading("Cancelling invite...");
    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel invite");
      toast.success("Invite cancelled", { id: tid });
      void fetchTeam();
      void fetchSeats();
    } catch (err: any) {
      toast.error(err.message, { id: tid });
    }
  };

  // ─── Tab Content: MEMBERS ────────────────────────────────────────────────

  const MembersTab = () => (
    <div className="space-y-6">
      {/* Header + Invite CTA */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Search by name, email or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-9 text-sm dark:bg-zinc-950 dark:border-zinc-800"
          />
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
            <SelectTrigger className="w-40 h-9 text-sm dark:bg-zinc-950 dark:border-zinc-800">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              {BUSINESS_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canManageMembers && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                disabled={seatData?.atLimit}
              >
                <UserPlus className="w-4 h-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg dark:bg-zinc-900 dark:border-zinc-800">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-500" />
                  Invite a Team Member
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-5 pt-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold dark:text-zinc-300">Email Address</Label>
                  <Input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="dark:bg-zinc-950 dark:border-zinc-800"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold dark:text-zinc-300">Business Role</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                    {BUSINESS_ROLES.filter((r) =>
                      r !== "OWNER" || currentRole === "OWNER"
                    ).filter((r) =>
                      currentRole ? canAssignRole(currentRole as BusinessRole, r) : false
                    ).map((role) => {
                      const colors = ROLE_BADGE_COLORS[role];
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setInviteRole(role)}
                          className={cn(
                            "text-left p-3 rounded-lg border-2 transition-all duration-150",
                            inviteRole === role
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                              : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                          )}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", colors.bg, colors.text, colors.border)}>
                              {role === "OWNER" && <Crown className="w-3 h-3 inline mr-1" />}
                              {ROLE_LABELS[role]}
                            </span>
                            {inviteRole === role && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                            {ROLE_DESCRIPTIONS[role]}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {seatData && (
                  <div className={cn(
                    "flex items-center gap-2 text-xs p-2 rounded-lg border",
                    seatData.atWarningThreshold
                      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 text-amber-700 dark:text-amber-400"
                      : "bg-zinc-50 border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400",
                  )}>
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {seatData.used} of {seatData.limitDisplay} seats used
                      ({seatData.activeMembers} members + {seatData.pendingInvites} pending)
                    </span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={inviteLoading || !inviteEmail}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invite"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Members List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-10 text-zinc-400 dark:text-zinc-500 text-sm">
            No members match your filter.
          </div>
        ) : (
          filteredMembers.map((member) => {
            const isCurrentUser = member.userId === (teamData as any)?.currentUserId;
            return (
              <div
                key={member.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl border transition-all",
                  member.isActive
                    ? "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                    : "bg-zinc-50 dark:bg-zinc-900/40 border-zinc-100 dark:border-zinc-800/60 opacity-60",
                )}
              >
                <Initials {...member.user} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {member.user.name || member.user.email}
                    </span>
                    {!member.isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">
                        Deactivated
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                    {member.user.email}
                    {member.joinedAt && ` · joined ${formatDate(member.joinedAt)}`}
                  </span>
                </div>

                {/* Role badge / inline editor */}
                {canManageRoles && member.isActive && currentRole && !isCurrentUser ? (
                  <Select
                    value={member.businessRole}
                    onValueChange={(v) => handleRoleChange(member.userId, v as BusinessRole)}
                    disabled={actionLoading === member.userId}
                  >
                    <SelectTrigger className="w-44 h-7 text-xs dark:bg-zinc-950 dark:border-zinc-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_ROLES.filter((r) =>
                        canAssignRole(currentRole as BusinessRole, r) ||
                        r === member.businessRole
                      ).map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <RoleBadge role={member.businessRole} />
                )}

                {/* Actions dropdown */}
                {canManageMembers && member.businessRole !== "OWNER" && !isCurrentUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-zinc-900 dark:border-zinc-800">
                      {member.isActive ? (
                        <>
                          <DropdownMenuItem
                            onClick={() => handleMemberAction(member.userId, "deactivate", member.user.name || member.user.email || "Member")}
                            className="text-amber-600 dark:text-amber-400 focus:text-amber-700"
                          >
                            <ShieldAlert className="w-4 h-4 mr-2" />
                            Deactivate (keep record)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleMemberAction(member.userId, "remove", member.user.name || member.user.email || "Member")}
                            className="text-rose-600 dark:text-rose-400 focus:text-rose-700"
                          >
                            <UserMinus className="w-4 h-4 mr-2" />
                            Remove from workspace
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleMemberAction(member.userId, "remove", member.user.name || member.user.email || "Member")}
                          className="text-rose-600 dark:text-rose-400 focus:text-rose-700"
                        >
                          <UserMinus className="w-4 h-4 mr-2" />
                          Remove permanently
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pending Invites */}
      {teamData && teamData.invites.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Pending Invites ({teamData.invites.length})
          </h3>
          <div className="space-y-2">
            {teamData.invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-900/30"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 truncate block">{inv.email}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    Expires {formatDate(inv.expiresAt)}
                  </span>
                </div>
                <RoleBadge role={inv.businessRole} />
                {canManageMembers && (
                  <button
                    type="button"
                    onClick={() => handleInviteCancel(inv.id, inv.email)}
                    className="text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Tab Content: ROLES & PERMISSIONS matrix ──────────────────────────────

  const RolesTab = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
          This matrix shows the default permissions for each built-in role. Roles are conservative by default — sensitive operations require explicit permission grants. These templates are defined in code and are auditable in your git history.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left px-3 py-2.5 font-semibold text-zinc-600 dark:text-zinc-400 min-w-[160px] sticky left-0 bg-zinc-50 dark:bg-zinc-900 z-10">
                Permission
              </th>
              {BUSINESS_ROLES.map((role) => (
                <th key={role} className="px-2 py-2.5 text-center font-semibold min-w-[80px]">
                  <RoleBadge role={role} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULE_GROUPS.map(({ module, label, keys }) => (
              <>
                <tr key={`group-${module}`} className="bg-zinc-50/70 dark:bg-zinc-900/70">
                  <td
                    colSpan={BUSINESS_ROLES.length + 1}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 sticky left-0"
                  >
                    {label}
                  </td>
                </tr>
                {keys.map((permission) => {
                  const isHighRisk = [
                    "accounting.post", "tax.edit", "tax.approve", "tax.file", "billing.manage",
                    "reports.export", "cash_flow.manage_assumptions",
                    "workspace.manage_roles",
                  ].includes(permission);
                  return (
                    <tr
                      key={permission}
                      className="border-t border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="px-3 py-2 font-mono text-zinc-600 dark:text-zinc-400 sticky left-0 bg-white dark:bg-zinc-950">
                        <span className={cn(isHighRisk && "text-amber-600 dark:text-amber-400")}>
                          {permission}
                        </span>
                        {isHighRisk && (
                          <ShieldAlert className="w-3 h-3 inline ml-1 text-amber-400" />
                        )}
                      </td>
                      {BUSINESS_ROLES.map((role) => {
                        const granted = (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
                        return (
                          <td key={role} className="px-2 py-2 text-center">
                            {granted ? (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        <ShieldAlert className="w-3 h-3 inline mr-1 text-amber-400" />
        High-sensitivity permissions require careful assignment — Finance Manager and above only.
      </p>
    </div>
  );

  // ─── Tab Content: SEATS ───────────────────────────────────────────────────

  const SeatsTab = () => {
    if (seatsLoading || !seatData) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      );
    }

    const pct = seatData.limit === Infinity ? 0 : Math.min(100, Math.round((seatData.used / seatData.limit) * 100));
    const isUnlimited = seatData.limit === Infinity;

    return (
      <div className="space-y-6 max-w-xl">
        {/* Plan badge */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20 border border-indigo-100 dark:border-indigo-900/30">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              {seatData.planTier} Plan
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              {isUnlimited ? "Unlimited seats" : `${seatData.limitDisplay} seat${seatData.limit === 1 ? "" : "s"} included`}
            </div>
          </div>
          {!isUnlimited && ["FREE", "PRO"].includes(String(seatData.planTier).toUpperCase()) && (
            <a
              href="/settings?tab=billing"
              className="ml-auto flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Upgrade <ArrowUpRight className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Seat meter */}
        {!isUnlimited && (
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Seat Utilization</span>
              <span className={cn(
                "text-lg font-bold",
                seatData.atLimit ? "text-rose-600" : seatData.atWarningThreshold ? "text-amber-600" : "text-indigo-600",
              )}>
                {seatData.used} <span className="text-sm font-normal text-zinc-400">/ {seatData.limitDisplay}</span>
              </span>
            </div>
            <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  seatData.atLimit
                    ? "bg-rose-500"
                    : seatData.atWarningThreshold
                    ? "bg-amber-500"
                    : "bg-indigo-500",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {seatData.atLimit && (
              <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Seat limit reached. Remove or deactivate a member, or upgrade your plan to invite more people.
              </div>
            )}
            {!seatData.atLimit && seatData.atWarningThreshold && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {seatData.availableDisplay} seat{Number(seatData.availableDisplay) === 1 ? "" : "s"} remaining. Consider upgrading before you run out.
              </div>
            )}
          </div>
        )}

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Members", value: seatData.activeMembers, color: "text-indigo-600", note: "Count toward seat limit" },
            { label: "Pending Invites", value: seatData.pendingInvites, color: "text-amber-600", note: "Reserve seats until accepted or expired" },
            { label: "Seats Available", value: isUnlimited ? "∞" : seatData.availableDisplay, color: seatData.atLimit ? "text-rose-600" : "text-emerald-600", note: isUnlimited ? "No limit on your plan" : "Ready to invite" },
          ].map((item) => (
            <div key={item.label} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
              <div className={cn("text-2xl font-bold mb-0.5", item.color)}>{item.value}</div>
              <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{item.label}</div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-tight">{item.note}</div>
            </div>
          ))}
        </div>

        <div className="text-xs text-zinc-400 dark:text-zinc-500 space-y-1">
          <p>· Deactivated members do <strong>not</strong> count toward the seat limit</p>
          <p>· Owners count toward the seat limit like any other member</p>
          <p>· Pending invites reserve a seat to prevent over-inviting</p>
        </div>
      </div>
    );
  };

  // ─── Tab Content: ACCESS ACTIVITY ─────────────────────────────────────────

  const ActivityTab = () => {
    const totalPages = Math.ceil(logsTotal / 15);
    return (
      <div className="space-y-4">
        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : accessLogs.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 text-sm">
            No access events recorded yet.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {accessLogs.map((log) => {
                const meta = EVENT_META[log.eventType] ?? {
                  icon: Activity, color: "text-zinc-400", label: log.eventType,
                };
                const Icon = meta.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className={cn("mt-0.5 shrink-0", meta.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{meta.label}</span>
                        {log.targetEmail && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">→ {log.targetEmail}</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {log.actorEmail && <span>By {log.actorEmail} · </span>}
                        {formatRelative(log.createdAt)}
                        {log.previousRoleLabel && log.newRoleLabel && (
                          <span className="ml-2 font-medium">
                            {log.previousRoleLabel} → {log.newRoleLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(logsPage - 1)}
                  disabled={logsPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-zinc-500">
                  Page {logsPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(logsPage + 1)}
                  disabled={logsPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ─── Tab Content: GOVERNANCE (informational only) ─────────────────────────

  const GovernanceTab = () => (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start gap-3 p-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/40 rounded-xl">
        <CheckCircle2 className="w-5 h-5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-bold text-violet-800 dark:text-violet-300 mb-1">
            Governance-Ready Infrastructure
          </div>
          <p className="text-xs text-violet-700 dark:text-violet-400 leading-relaxed">
            BabaBuilds ERP has pre-defined Segregation of Duties (SoD) conflict rules and Maker-Checker privileged workflow definitions. These are currently informational — they will be enforced as live controls in a future phase.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Scale className="w-4 h-4 text-violet-500" />
          SoD Conflict Awareness
        </h3>
        {[
          { conflict: "Invoice Creation + Payment Approval", reason: "A single person raising and approving their own invoice payment bypasses dual-control.", risk: "HIGH" },
          { conflict: "Expense Approval + Expense Creation", reason: "Self-approving expenses creates an unchecked financial risk.", risk: "HIGH" },
          { conflict: "Accounting Post + Tax Manage", reason: "Controlling both journal entries and tax configuration enables misclassification.", risk: "HIGH" },
          { conflict: "Billing Manage + Workspace Role Manage", reason: "Managing both billing and access roles enables privilege escalation.", risk: "MEDIUM" },
        ].map((rule) => (
          <div key={rule.conflict} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{rule.conflict}</span>
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                rule.risk === "HIGH" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
              )}>
                {rule.risk}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{rule.reason}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-500" />
          Privileged Workflows (Maker-Checker Ready)
        </h3>
        {[
          { name: "Large Payment Release", steps: ["INITIATE (Finance Manager)", "REVIEW (Admin)", "APPROVE (Owner)", "EXECUTE"] },
          { name: "Vendor PO Approval", steps: ["INITIATE (Operations Manager)", "APPROVE (Admin)", "EXECUTE"] },
          { name: "Tax Configuration Change", steps: ["INITIATE (Finance Manager)", "APPROVE (Owner)", "EXECUTE"] },
        ].map((wf) => (
          <div key={wf.name} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">{wf.name}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {wf.steps.map((step, i) => (
                <React.Fragment key={step}>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/40 text-violet-700 dark:text-violet-400 font-medium">
                    {step}
                  </span>
                  {i < wf.steps.length - 1 && (
                    <span className="text-zinc-300 dark:text-zinc-700 text-xs">→</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-4">
        ⓘ Governance controls are informational in Phase 1. Live SoD enforcement and Maker-Checker workflows will be introduced in a future release.
      </div>
    </div>
  );

  // ─── TAB DEFINITIONS ─────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "members",    label: "Members",           icon: Users,      count: teamData?.members.filter(m => m.isActive).length },
    { id: "roles",      label: "Roles & Permissions", icon: LayoutGrid },
    { id: "seats",      label: "Seats / Plan",      icon: Shield      },
    { id: "activity",   label: "Access Activity",   icon: Activity    },
    { id: "governance", label: "Governance",        icon: Scale       },
  ];

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Shield className="w-6 h-6 text-indigo-500" />
              Team &amp; Access
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Manage workspace members, roles, permissions, seat allocation and access governance.
              {currentRole && (
                <> Your role: <RoleBadge role={currentRole as BusinessRole} className="ml-1" /></>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { void fetchTeam(); void fetchSeats(); }} className="gap-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200 dark:border-zinc-700"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    activeTab === tab.id
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400",
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          {activeTab === "members"    && <MembersTab />}
          {activeTab === "roles"      && <RolesTab />}
          {activeTab === "seats"      && <SeatsTab />}
          {activeTab === "activity"   && <ActivityTab />}
          {activeTab === "governance" && <GovernanceTab />}
        </div>
      </div>
    </div>
  );
}
