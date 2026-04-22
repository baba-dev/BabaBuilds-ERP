"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  Copy,
  HandCoins,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DashboardData = {
  profile: {
    id: string;
    code: string;
    isActive: boolean;
    totalReferrals: number;
    successfulReferrals: number;
    createdAt: string;
  } | null;
  customerStats: {
    walletCredits: number;
    freeMonths: number;
  };
  reseller: {
    id: string;
    name: string;
    email: string;
    payoutTerms: string;
    defaultCustomerDiscount: number;
    defaultCommissionPercent: number;
  } | null;
  overview: {
    totalLeads: number;
    qualifiedLeads: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: number;
    totalRevenue: number;
    activeCoupons: number;
    couponUsage: number;
    pendingCommission: number;
    paidCommission: number;
  };
  todayActions: string[];
  pipeline: Array<{
    id: string;
    stage: "LEAD" | "QUALIFIED" | "WON" | "LOST";
    workspaceId: string;
    workspaceName: string;
    couponCode: string | null;
    createdAt: string;
    conversionAt: string | null;
    paidTransactions: number;
    revenue: number;
  }>;
  coupons: Array<{
    id: string;
    code: string;
    isActive: boolean;
    usedCount: number;
    maxUses: number | null;
    discountValue: number;
    commissionPercent: number;
    createdAt: string;
    startsAt: string | null;
    endsAt: string | null;
    daysRemaining: number | null;
    leadCount: number;
    conversionRate: number;
  }>;
  commissions: Array<{
    id: string;
    status: "PENDING" | "APPROVED" | "PAID" | "VOID";
    dealAmount: number;
    commissionPercent: number;
    commissionAmount: number;
    createdAt: string;
    workspaceName: string;
    providerReference: string | null;
    transactionDate: string | null;
  }>;
};

function stageBadge(stage: DashboardData["pipeline"][number]["stage"]) {
  if (stage === "WON") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (stage === "QUALIFIED") return "bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (stage === "LOST") return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

function commissionBadge(status: DashboardData["commissions"][number]["status"]) {
  if (status === "PAID") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "APPROVED") return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (status === "VOID") return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export default function ReferralsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemCode, setRedeemCode] = useState("");
  const [resellerCode, setResellerCode] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/referrals/dashboard", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to load reseller dashboard");
      setData(payload as DashboardData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load reseller dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createProfile = async () => {
    try {
      const res = await fetch("/api/referrals", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to create referral code");
      toast.success("Referral code generated.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create referral code");
    }
  };

  const redeemReferral = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/referrals/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: redeemCode,
          friendDiscountPercent: 20,
          rewardType: "FREE_MONTH",
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to redeem referral");
      setRedeemCode("");
      toast.success("Referral code redeemed successfully.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to redeem referral");
    }
  };

  const redeemReseller = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/reseller/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: resellerCode }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to apply reseller coupon");
      setResellerCode("");
      toast.success(
        `Applied ${payload.customerDiscountPercent}% customer discount and ${payload.resellerCommissionPercent}% commission mapping.`,
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply reseller coupon");
    }
  };

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Code copied.");
    } catch {
      toast.error("Could not copy.");
    }
  };

  const funnelProgress = useMemo(() => {
    if (!data || data.overview.totalLeads === 0) return 0;
    return Math.round((data.overview.wonLeads / data.overview.totalLeads) * 100);
  }, [data]);

  if (loading && !data) {
    return <div className="mx-auto max-w-7xl p-6 text-sm text-zinc-500">Loading reseller dashboard...</div>;
  }

  if (!data) {
    return <div className="mx-auto max-w-7xl p-6 text-sm text-rose-600">Unable to load dashboard data.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
      <div className="rounded-3xl border border-border/80 bg-gradient-to-br from-surface-elevated to-surface-base p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-body">Reseller dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">
              Partner Growth Command Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-body md:text-base">
              Track coupon performance, pipeline progression, commissions, and partner operations from one secure view.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total leads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{data.overview.totalLeads}</p>
            <p className="mt-1 text-xs text-muted-body">{data.overview.qualifiedLeads} qualified</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conversion rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{data.overview.conversionRate}%</p>
            <Progress value={funnelProgress} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Referred revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">${data.overview.totalRevenue.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted-body">{data.overview.couponUsage} total coupon uses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Commission pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">${data.overview.pendingCommission.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted-body">
              ${data.overview.paidCommission.toFixed(2)} paid out
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" /> Today's actions
            </CardTitle>
            <CardDescription>Suggested next moves based on current pipeline and coupon health.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.todayActions.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-xl border border-border/70 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <p className="text-sm text-foreground/90">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-indigo-500" /> Referral quick tools
            </CardTitle>
            <CardDescription>Customer referral benefits and quick utility actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-border/80 p-3">
                <p className="text-lg font-black">${data.customerStats.walletCredits.toFixed(0)}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-body">Wallet credit</p>
              </div>
              <div className="rounded-xl border border-border/80 p-3">
                <p className="text-lg font-black">{data.customerStats.freeMonths}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-body">Free months</p>
              </div>
              <div className="rounded-xl border border-border/80 p-3">
                <p className="text-lg font-black">{data.profile?.successfulReferrals ?? 0}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-body">Successful</p>
              </div>
            </div>
            {data.profile ? (
              <div className="rounded-xl border border-border/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm font-bold">{data.profile.code}</p>
                  <Button size="sm" variant="outline" onClick={() => void copyCode(data.profile!.code)}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-body">
                  Total referred: {data.profile.totalReferrals} · Successful: {data.profile.successfulReferrals}
                </p>
              </div>
            ) : (
              <Button onClick={() => void createProfile()}>Generate referral code</Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">
            <Target className="h-4 w-4" /> Pipeline
          </TabsTrigger>
          <TabsTrigger value="coupons">
            <BadgeDollarSign className="h-4 w-4" /> Coupons
          </TabsTrigger>
          <TabsTrigger value="commissions">
            <Wallet className="h-4 w-4" /> Commissions
          </TabsTrigger>
          <TabsTrigger value="toolkit">
            <TrendingUp className="h-4 w-4" /> Toolkit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <Card>
            <CardHeader>
              <CardTitle>Lead pipeline</CardTitle>
              <CardDescription>Stage visibility across referred workspaces.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Coupon</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Paid tx</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pipeline.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-body">
                        No reseller lead activity yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.pipeline.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-semibold">{lead.workspaceName}</TableCell>
                        <TableCell>
                          <Badge className={stageBadge(lead.stage)}>{lead.stage}</Badge>
                        </TableCell>
                        <TableCell>{lead.couponCode ?? "—"}</TableCell>
                        <TableCell>{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>{lead.paidTransactions}</TableCell>
                        <TableCell className="text-right font-bold">${lead.revenue.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coupons">
          <Card>
            <CardHeader>
              <CardTitle>Coupon analytics</CardTitle>
              <CardDescription>Usage, conversion, and expiry visibility per code.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Discount / Comm</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Conversion</TableHead>
                    <TableHead>Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.coupons.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-body">
                        No reseller coupons linked to your account yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.coupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold">{coupon.code}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void copyCode(coupon.code)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={coupon.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"}>
                            {coupon.isActive ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                        </TableCell>
                        <TableCell>{coupon.discountValue}% / {coupon.commissionPercent}%</TableCell>
                        <TableCell>{coupon.usedCount}{coupon.maxUses != null ? ` / ${coupon.maxUses}` : ""}</TableCell>
                        <TableCell>{coupon.leadCount}</TableCell>
                        <TableCell>{coupon.conversionRate}%</TableCell>
                        <TableCell>
                          {coupon.daysRemaining == null ? "No expiry" : `${coupon.daysRemaining} days`}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle>Commission ledger</CardTitle>
              <CardDescription>Transparent payout trail by deal.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deal</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.commissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-body">
                        No commission entries yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.commissions.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-semibold">{item.workspaceName}</TableCell>
                        <TableCell>
                          <Badge className={commissionBadge(item.status)}>{item.status}</Badge>
                        </TableCell>
                        <TableCell>${item.dealAmount.toFixed(2)}</TableCell>
                        <TableCell>{item.commissionPercent}%</TableCell>
                        <TableCell className="font-bold">${item.commissionAmount.toFixed(2)}</TableCell>
                        <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>{item.providerReference ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="toolkit">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HandCoins className="h-4 w-4 text-orange-500" /> Quick applications
                </CardTitle>
                <CardDescription>Apply codes directly while on client calls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={redeemReseller} className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-body">Apply reseller coupon</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      required
                      placeholder="Enter reseller coupon code"
                      value={resellerCode}
                      onChange={(e) => setResellerCode(e.target.value)}
                    />
                    <Button type="submit" className="sm:w-auto">Apply</Button>
                  </div>
                </form>
                <form onSubmit={redeemReferral} className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-body">Redeem referral code</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      required
                      placeholder="Enter referral code"
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value)}
                    />
                    <Button type="submit" variant="outline" className="sm:w-auto">
                      Redeem
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" /> Partner toolkit
                </CardTitle>
                <CardDescription>Enablement tracks and public partner resources.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Link href="/reseller" className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3 hover:bg-muted/40">
                  <span>Public reseller landing + pricing handoff</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/help" className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3 hover:bg-muted/40">
                  <span>Help hub and implementation support docs</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/settings/billing" className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3 hover:bg-muted/40">
                  <span>Checkout validation + billing settings</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
