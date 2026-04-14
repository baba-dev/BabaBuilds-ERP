"use client";

import { useMemo, useState, useEffect } from "react";
import { Users, Mail, CheckCircle, Clock, Lock, Sparkles, Building2, UserPlus, ArrowRight, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { m, LazyMotion, domAnimation } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TeamMember = {
  id: string;
  role: string;
  userId: string;
  user: { name: string | null; email: string | null; image: string | null };
};

type TeamInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

export default function TeamSettings() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [loading, setLoading] = useState(false);
  const [planTier, setPlanTier] = useState("FREE");
  const [isOpen, setIsOpen] = useState(false);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.planTier) {
          setPlanTier(data.planTier);
        }
      })
      .catch((err) => {
        console.warn("Failed to load plan tier from settings", err);
      });
  }, []);

  const isTeamPlan = planTier === "TEAM" || planTier === "ENTERPRISE"; // Safety fallback

  const canManageMembers = useMemo(() => currentUserRole === "OWNER" || currentUserRole === "ADMIN", [currentUserRole]);

  const fetchTeam = async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await fetch("/api/team/members", { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || "Failed to load team members");
      setMembers(Array.isArray(payload?.data?.members) ? payload.data.members : []);
      setInvites(Array.isArray(payload?.data?.invites) ? payload.data.invites : []);
      setCurrentUserRole(payload?.data?.currentUserRole ?? null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load team members";
      setTeamError(message);
      setMembers([]);
      setInvites([]);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    void fetchTeam();
  }, []);
  
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeamPlan) return;

    setLoading(true);
    const toastId = toast.loading("Sending secure invite...");
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch invite");
      
      toast.success("Team member successfully invited", { id: toastId });
      setEmail("");
      setIsOpen(false);
      void fetchTeam();
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    if (!canManageMembers) return;
    setRemovingId(inviteId);
    const toastId = toast.loading("Cancelling invite...");
    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || "Failed to cancel invite");
      toast.success("Invite cancelled.", { id: toastId });
      void fetchTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel invite", { id: toastId });
    } finally {
      setRemovingId(null);
    }
  };

  const removeMember = async (targetUserId: string) => {
    if (!canManageMembers) return;
    setRemovingId(targetUserId);
    const toastId = toast.loading("Removing member...");
    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || "Failed to remove member");
      toast.success("Member removed.", { id: toastId });
      void fetchTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member", { id: toastId });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <m.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 max-w-4xl"
      >
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 w-full" />
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/20 pb-8">
            <div>
              <CardTitle className="text-2xl font-black flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
                <Building2 className="w-6 h-6 text-indigo-500" /> Workspace Team
              </CardTitle>
              <CardDescription className="font-medium mt-1">
                Collaborate securely with partners and accountants.
              </CardDescription>
            </div>
            
            {!isTeamPlan ? (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 px-4 py-2 rounded-xl text-sm font-semibold">
                <Lock className="w-4 h-4 shrink-0" />
                Team tools require Team Plan
              </div>
            ) : (
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 font-bold gap-2 rounded-xl">
                    <UserPlus className="w-4 h-4" /> Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl">
                  <div className="bg-gradient-to-br from-indigo-50 dark:from-indigo-950/40 to-white dark:to-zinc-950 p-6 px-8 border-b border-zinc-100 dark:border-zinc-800/60">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-extrabold flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
                        <UserPlus className="w-5 h-5 text-indigo-500" /> Add to Workspace
                      </DialogTitle>
                      <DialogDescription className="font-medium">
                        Send a secure, tokenized email link to a new participant.
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                  
                  <form onSubmit={handleInvite} className="p-8 space-y-6">
                    <div className="space-y-3">
                       <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Team Member Email</Label>
                       <Input 
                        type="email" 
                        required 
                        placeholder="colleague@example.com" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 transition-all focus:bg-white dark:focus:bg-zinc-950 px-4 focus-visible:ring-indigo-500" 
                      />
                    </div>

                    <div className="space-y-3">
                       <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Assign Role Focus</Label>
                       <Select value={role} onValueChange={setRole}>
                         <SelectTrigger className="h-11 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                           <SelectValue placeholder="Select a role" />
                         </SelectTrigger>
                         <SelectContent className="border-zinc-200 dark:border-zinc-800">
                           <SelectItem value="MEMBER">
                              <div className="flex flex-col">
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">Member</span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Can view and create invoices natively</span>
                              </div>
                           </SelectItem>
                           <SelectItem value="VIEWER">
                              <div className="flex flex-col">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">Accountant / Viewer</span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Strictly read-only access for auditing</span>
                              </div>
                           </SelectItem>
                           <SelectItem value="ADMIN">
                              <div className="flex flex-col">
                                <span className="font-bold text-rose-600 dark:text-rose-400">Admin</span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Full control over settings and data</span>
                              </div>
                           </SelectItem>
                         </SelectContent>
                       </Select>
                    </div>

                    <Button 
                      disabled={loading} 
                      type="submit" 
                      className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl mt-4 relative overflow-hidden group"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {loading ? "Dispatching..." : "Send Invitation"} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* ACTIVE MEMBERS */}
               <div className="space-y-4">
                 <h3 className="font-black text-sm tracking-[0.2em] text-zinc-400 uppercase flex items-center gap-2">
                   <Users className="w-4 h-4" /> Active Seats
                 </h3>
                 <div className={`rounded-xl border ${isTeamPlan ? 'border-zinc-200 dark:border-zinc-800' : 'border-zinc-200/50 dark:border-zinc-800/50 opacity-60'} overflow-hidden relative`}>
                    {!isTeamPlan && (
                      <div className="absolute inset-0 z-10 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-[2px] flex items-center justify-center">
                        <Button variant="outline" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 font-bold shadow-lg">
                          <Sparkles className="w-4 h-4 text-amber-500 mr-2" /> Upgrade to Team
                        </Button>
                      </div>
                    )}
                    <div className="p-5 bg-zinc-50/30 dark:bg-zinc-900/30 min-h-[160px]">
                      {teamLoading ? (
                        <div className="text-sm text-zinc-500 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center animate-pulse" />
                          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Loading members…</p>
                        </div>
                      ) : teamError ? (
                        <div className="text-sm text-zinc-500 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">Unable to load members</p>
                          <p className="text-xs text-zinc-500 max-w-[240px]">{teamError}</p>
                          <Button variant="outline" size="sm" onClick={fetchTeam}>Retry</Button>
                        </div>
                      ) : members.length === 0 ? (
                        <div className="text-sm text-zinc-500 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <Users className="w-5 h-5 text-zinc-400" />
                          </div>
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">No members found</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {members.map((m) => (
                            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 dark:bg-zinc-950/30 border border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                  {m.user?.name || m.user?.email || "Unnamed"}
                                </p>
                                <p className="text-xs text-zinc-500 truncate">{m.user?.email || "—"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">
                                  {m.role}
                                </Badge>
                                {canManageMembers && m.userId !== undefined && m.userId !== "" && m.userId !== (null as any) && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                    onClick={() => removeMember(m.userId)}
                                    disabled={removingId === m.userId}
                                    title="Remove member"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>
               </div>

               {/* PENDING INVITES */}
               <div className="space-y-4">
                 <h3 className="font-black text-sm tracking-[0.2em] text-zinc-400 uppercase flex items-center gap-2">
                   <Mail className="w-4 h-4" /> Transit Tokens
                 </h3>
                 <div className={`rounded-xl border ${isTeamPlan ? 'border-zinc-200 dark:border-zinc-800' : 'border-zinc-200/50 dark:border-zinc-800/50 opacity-60'} overflow-hidden relative`}>
                    {!isTeamPlan && (
                      <div className="absolute inset-0 z-10 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-[2px]"></div>
                    )}
                    <div className="p-5 bg-zinc-50/30 dark:bg-zinc-900/30 min-h-[160px]">
                      {teamLoading ? (
                        <div className="text-sm text-zinc-500 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center animate-pulse" />
                          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Loading invites…</p>
                        </div>
                      ) : teamError ? (
                        <div className="text-sm text-zinc-500 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">Unable to load invites</p>
                          <p className="text-xs text-zinc-500 max-w-[240px]">{teamError}</p>
                          <Button variant="outline" size="sm" onClick={fetchTeam}>Retry</Button>
                        </div>
                      ) : invites.length === 0 ? (
                        <div className="text-sm text-zinc-500 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 dark:text-zinc-100">No Pending Invites</p>
                            <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">Invited users who haven't accepted will appear here.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {invites.map((inv) => (
                            <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 dark:bg-zinc-950/30 border border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{inv.email}</p>
                                <p className="text-xs text-zinc-500 truncate">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">
                                  {inv.role}
                                </Badge>
                                {canManageMembers && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                    onClick={() => cancelInvite(inv.id)}
                                    disabled={removingId === inv.id}
                                    title="Cancel invite"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>
               </div>
            </div>
          </CardContent>
        </Card>
      </m.div>
    </LazyMotion>
  );
}
