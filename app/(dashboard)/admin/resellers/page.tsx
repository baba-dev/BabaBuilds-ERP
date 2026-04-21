"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ResellerItem = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  payoutTerms: string;
  defaultCustomerDiscount: number;
  defaultCommissionPercent: number;
  leadCount: number;
  conversionRate: number;
  activeCoupons: number;
  couponUsage: number;
};

type CouponItem = {
  id: string;
  resellerId: string;
  resellerName: string;
  code: string;
  usedCount: number;
  maxUses: number | null;
  isActive: boolean;
  discountValue: number;
  commissionPercent: number;
  conversionRate: number;
  revenue: number;
  renewals: number;
  leadDetails: Array<{
    id: string;
    stage: "LEAD" | "QUALIFIED" | "WON" | "LOST";
    appliedAt: string;
    conversionAt: string | null;
    workspaceId: string;
    workspaceName: string;
    paidTransactions: number;
    revenue: number;
  }>;
};

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<ResellerItem[]>([]);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [payoutTerms, setPayoutTerms] = useState("Net 30");

  const load = async () => {
    setLoading(true);
    try {
      const [resellerRes, couponRes] = await Promise.all([
        fetch("/api/admin/resellers", { cache: "no-store" }),
        fetch("/api/admin/reseller-coupons", { cache: "no-store" }),
      ]);
      const resellerData = await resellerRes.json();
      const couponData = await couponRes.json();
      if (!resellerRes.ok) throw new Error(resellerData?.error || "Failed to load reseller data");
      if (!couponRes.ok) throw new Error(couponData?.error || "Failed to load coupon data");
      setResellers(resellerData.items ?? []);
      setCoupons(couponData.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load reseller data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const couponMetrics = useMemo(() => {
    const totalRevenue = coupons.reduce((sum, coupon) => sum + coupon.revenue, 0);
    const totalRenewals = coupons.reduce((sum, coupon) => sum + coupon.renewals, 0);
    const totalUsage = coupons.reduce((sum, coupon) => sum + coupon.usedCount, 0);
    return { totalRevenue, totalRenewals, totalUsage };
  }, [coupons]);

  const handleCreateReseller = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/resellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, payoutTerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create reseller");
      toast.success("Reseller account created");
      setName("");
      setEmail("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create reseller");
    }
  };

  const generateCoupon = async (resellerId: string) => {
    try {
      const res = await fetch("/api/admin/reseller-coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resellerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create coupon");
      toast.success(`Coupon created: ${data.coupon?.code ?? "new code"}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create coupon");
    }
  };

  const toggleCoupon = async (couponId: string, nextActive: boolean) => {
    try {
      const res = await fetch("/api/admin/reseller-coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId, isActive: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update coupon");
      toast.success(`Coupon ${nextActive ? "activated" : "deactivated"}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update coupon");
    }
  };

  const syncCommissions = async () => {
    try {
      const res = await fetch("/api/admin/resellers/commissions/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to sync commissions");
      toast.success(`Commission sync complete: ${data.created ?? 0} created`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync commissions");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Reseller Program Admin</h1>
          <p className="text-sm text-zinc-500">Manage reseller accounts, coupons, conversions, and renewals.</p>
        </div>
        <Button onClick={syncCommissions}>Sync commissions from paid deals</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Coupon usage</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">{couponMetrics.totalUsage}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue from referred deals</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">${couponMetrics.totalRevenue.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Renewals from referred accounts</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">{couponMetrics.totalRenewals}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create reseller account</CardTitle>
          <CardDescription>Set up a reseller and generate unique coupon codes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateReseller} className="grid gap-3 md:grid-cols-4">
            <Input required placeholder="Reseller name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input required type="email" placeholder="Reseller email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Payout terms" value={payoutTerms} onChange={(e) => setPayoutTerms(e.target.value)} />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reseller accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-zinc-500">Loading reseller records...</p>}
          {!loading && resellers.length === 0 && (
            <p className="text-sm text-zinc-500">No reseller accounts yet.</p>
          )}
          {resellers.map((reseller) => (
            <div key={reseller.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{reseller.name}</p>
                  <p className="text-xs text-zinc-500">{reseller.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{reseller.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => generateCoupon(reseller.id)}>
                    Generate coupon
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:grid-cols-4">
                <p>Discount: {reseller.defaultCustomerDiscount}%</p>
                <p>Commission: {reseller.defaultCommissionPercent}%</p>
                <p>Leads: {reseller.leadCount}</p>
                <p>Conversion: {reseller.conversionRate}%</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coupon tracking</CardTitle>
          <CardDescription>Usage, revenue, conversion and renewals per code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {coupons.length === 0 && <p className="text-sm text-zinc-500">No coupons created yet.</p>}
          {coupons.map((coupon) => (
            <div key={coupon.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold">{coupon.code}</p>
                  <p className="text-xs text-zinc-500">{coupon.resellerName}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleCoupon(coupon.id, !coupon.isActive)}>
                  {coupon.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:grid-cols-5">
                <p>Usage: {coupon.usedCount}</p>
                <p>Revenue: ${coupon.revenue.toFixed(2)}</p>
                <p>Conversion: {coupon.conversionRate}%</p>
                <p>Renewals: {coupon.renewals}</p>
                <p>Discount/Comm: {coupon.discountValue}% / {coupon.commissionPercent}%</p>
              </div>
              {coupon.leadDetails.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider">Workspace</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider">Stage</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider">Applied</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider">Converted</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider">Paid Tx</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupon.leadDetails.map((lead) => (
                        <tr key={lead.id} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-3 py-2">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{lead.workspaceName}</p>
                            <p className="text-[10px] text-zinc-500">{lead.workspaceId.slice(0, 8)}...</p>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={lead.stage === "WON" ? "default" : "secondary"}>{lead.stage}</Badge>
                          </td>
                          <td className="px-3 py-2">{new Date(lead.appliedAt).toLocaleDateString()}</td>
                          <td className="px-3 py-2">
                            {lead.conversionAt ? new Date(lead.conversionAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-2">{lead.paidTransactions}</td>
                          <td className="px-3 py-2 text-right font-semibold">${lead.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
