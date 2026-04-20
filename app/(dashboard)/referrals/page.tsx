"use client";

import { FormEvent, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ReferralProfile = {
  id: string;
  code: string;
  isActive: boolean;
  totalReferrals: number;
  successfulReferrals: number;
};

type Redemption = {
  id: string;
  referredWorkspaceName: string;
  friendDiscountPercent: number;
  createdAt: string;
  rewards: Array<{
    id: string;
    rewardType: "FREE_MONTH" | "WALLET_CREDIT";
    rewardStatus: string;
    walletCreditAmount: number | null;
    freeMonthsCount: number | null;
  }>;
};

export default function ReferralsPage() {
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [walletCredits, setWalletCredits] = useState(0);
  const [freeMonths, setFreeMonths] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeemCode, setRedeemCode] = useState("");
  const [resellerCode, setResellerCode] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/referrals", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load referral data");
      setProfile(data.profile ?? null);
      setRedemptions(data.redemptions ?? []);
      setWalletCredits(data.stats?.walletCredits ?? 0);
      setFreeMonths(data.stats?.freeMonths ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load referrals");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create referral profile");
      toast.success("Your referral code is ready.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create referral profile");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to redeem referral");
      toast.success("Referral applied. You now have friend discount on your first cycle.");
      setRedeemCode("");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to apply reseller coupon");
      toast.success(
        `Applied: ${data.customerDiscountPercent}% customer discount and ${data.resellerCommissionPercent}% reseller commission.`,
      );
      setResellerCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply reseller coupon");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Referrals & Rewards</h1>
        <p className="text-sm text-zinc-500">
          Share your referral code to reward existing customers and discount new customers.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Wallet credit</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">${walletCredits.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Free months earned</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">{freeMonths}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Successful referrals</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">{profile?.successfulReferrals ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your customer referral code</CardTitle>
          <CardDescription>
            Referrer reward: 1 free month (or wallet credit by policy). New customer: 20% first cycle discount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-zinc-500">Loading profile...</p>}
          {!loading && !profile && (
            <Button onClick={createProfile}>Generate my referral code</Button>
          )}
          {profile && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-lg font-bold">{profile.code}</p>
                <Badge>{profile.isActive ? "ACTIVE" : "INACTIVE"}</Badge>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Total referred: {profile.totalReferrals} • Successful: {profile.successfulReferrals}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redeem referral code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={redeemReferral} className="flex flex-col gap-3 md:flex-row">
            <Input
              required
              placeholder="Enter referral code"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
            />
            <Button type="submit">Redeem</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apply reseller coupon</CardTitle>
          <CardDescription>
            Separate from customer referrals. Customer discount + reseller commission are recorded together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={redeemReseller} className="flex flex-col gap-3 md:flex-row">
            <Input
              required
              placeholder="Enter reseller coupon code"
              value={resellerCode}
              onChange={(e) => setResellerCode(e.target.value)}
            />
            <Button type="submit">Apply coupon</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referral activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {redemptions.length === 0 && <p className="text-sm text-zinc-500">No referral activity yet.</p>}
          {redemptions.map((item) => (
            <div key={item.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="font-semibold">{item.referredWorkspaceName}</p>
              <p className="text-xs text-zinc-500">
                Friend discount: {item.friendDiscountPercent}% • {new Date(item.createdAt).toLocaleString()}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.rewards.map((reward) => (
                  <Badge key={reward.id} variant="secondary">
                    {reward.rewardType === "FREE_MONTH"
                      ? `${reward.freeMonthsCount ?? 1} free month`
                      : `$${reward.walletCreditAmount ?? 0} credit`}{" "}
                    • {reward.rewardStatus}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
