"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Ticket, IndianRupee, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type DistributorRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  defaultMarginPercent: number;
  couponCount: number;
  totalCommissionAmount: number;
};

type CouponRow = {
  id: string;
  code: string;
  distributorId: string;
  distributorName: string;
  customerDiscountPercent: number;
  marginPercent: number;
  isActive: boolean;
  usedCount: number;
  maxUses: number | null;
};

type CommissionRow = {
  id: string;
  createdAt: string;
  distributorName: string;
  couponCode: string | null;
  workspaceName: string;
  listAmount: number;
  paidAmount: number;
  marginPercent: number;
  commissionAmount: number;
};

export default function AdminDistributorsPage() {
  const [loading, setLoading] = useState(true);
  const [distributors, setDistributors] = useState<DistributorRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMargin, setNewMargin] = useState(12);
  const [newDiscount, setNewDiscount] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, cRes, mRes] = await Promise.all([
        fetch("/api/admin/distributors", { cache: "no-store" }),
        fetch("/api/admin/distributors/coupons", { cache: "no-store" }),
        fetch("/api/admin/distributors/commissions", { cache: "no-store" }),
      ]);
      const dJson = await dRes.json();
      const cJson = await cRes.json();
      const mJson = await mRes.json();
      if (!dRes.ok) throw new Error(dJson?.error || "Failed to load distributors");
      if (!cRes.ok) throw new Error(cJson?.error || "Failed to load coupons");
      if (!mRes.ok) throw new Error(mJson?.error || "Failed to load commissions");
      setDistributors(dJson.items ?? []);
      setCoupons(cJson.items ?? []);
      setCommissions(mJson.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createDistributor = async () => {
    try {
      const res = await fetch("/api/admin/distributors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          defaultMarginPercent: newMargin,
          customerDiscountPercent: newDiscount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Create failed");
      toast.success(`Distributor created. Coupon: ${data.coupon?.code ?? "—"}`);
      setNewName("");
      setNewEmail("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const toggleCoupon = async (couponId: string, next: boolean) => {
    try {
      const res = await fetch("/api/admin/distributors/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId, isActive: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Distributors</h1>
        <p className="text-sm text-zinc-500">
          Create channel partners, assign margin per sale, and issue subscription checkout coupons.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" /> Add distributor
          </CardTitle>
          <CardDescription>Creates a partner record and one system-generated coupon for subscription checkout.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="d-name">Name</Label>
            <Input id="d-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Partner name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-email">Email</Label>
            <Input
              id="d-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="partner@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-margin">Margin % (your cut of list price)</Label>
            <Input
              id="d-margin"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={newMargin}
              onChange={(e) => setNewMargin(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-disc">Customer discount % (checkout)</Label>
            <Input
              id="d-disc"
              type="number"
              min={0}
              max={100}
              step={1}
              value={newDiscount}
              onChange={(e) => setNewDiscount(Number(e.target.value))}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" onClick={() => void createDistributor()}>
              Create distributor + coupon
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" /> Coupons
          </CardTitle>
          <CardDescription>Partners share these codes; customers enter them on the upgrade screen before paying.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {coupons.length === 0 ? (
            <p className="text-sm text-zinc-500">No coupons yet.</p>
          ) : (
            coupons.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-sm font-bold">{c.code}</p>
                  <p className="text-xs text-zinc-500">{c.distributorName}</p>
                  <p className="text-xs text-zinc-600">
                    Discount {c.customerDiscountPercent}% · Margin {c.marginPercent}% · Used {c.usedCount}
                    {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void toggleCoupon(c.id, !c.isActive)}>
                  {c.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <IndianRupee className="h-5 w-5" /> Commission ledger (recent)
          </CardTitle>
          <CardDescription>Margin is calculated on catalog list price for each paid subscription charge.</CardDescription>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <p className="text-sm text-zinc-500">No commission rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Partner</th>
                    <th className="py-2 pr-4">Workspace</th>
                    <th className="py-2 pr-4">List</th>
                    <th className="py-2 pr-4">Paid</th>
                    <th className="py-2 pr-4">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {commissions.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{r.distributorName}</td>
                      <td className="py-2 pr-4">{r.workspaceName}</td>
                      <td className="py-2 pr-4">₹{r.listAmount.toFixed(2)}</td>
                      <td className="py-2 pr-4">₹{r.paidAmount.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-semibold">₹{r.commissionAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Partners</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {distributors.length === 0 ? (
            <p className="text-sm text-zinc-500">No distributors yet.</p>
          ) : (
            distributors.map((d) => (
              <div key={d.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <p className="font-bold">{d.name}</p>
                <p className="text-xs text-zinc-500">{d.email}</p>
                <p className="text-xs">
                  Default margin {d.defaultMarginPercent}% · Coupons {d.couponCount} · Commissions ₹
                  {d.totalCommissionAmount.toFixed(2)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
