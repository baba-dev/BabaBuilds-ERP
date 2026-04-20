"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Ticket, IndianRupee, Loader2, RefreshCw, Download, Link2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";

type DistributorRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  defaultMarginPercent: number;
  defaultMarginBasis: string;
  marginByPlanJson: unknown;
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
  marginBasis: string | null;
  allowedTiers: string;
  firstPurchaseOnly: boolean;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  usedCount: number;
  maxUses: number | null;
};

type CommissionRow = {
  id: string;
  createdAt: string;
  status: string;
  marginBasisUsed: string;
  distributorId: string;
  distributorName: string;
  couponCode: string | null;
  workspaceName: string;
  listAmount: number;
  paidAmount: number;
  marginPercent: number;
  commissionAmount: number;
  payoutId: string | null;
};

type ReconPayload = {
  range: { from: string; to: string };
  local: { count: number; totalInr: number };
  razorpay: { count: number; totalInr: number; error: string | null };
  varianceInr: number | null;
};

export default function AdminDistributorsPage() {
  const [loading, setLoading] = useState(true);
  const [distributors, setDistributors] = useState<DistributorRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [recon, setRecon] = useState<ReconPayload | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMargin, setNewMargin] = useState(12);
  const [newDiscount, setNewDiscount] = useState(10);
  const [newMarginBasis, setNewMarginBasis] = useState<"LIST" | "PAID">("LIST");

  const [editDistId, setEditDistId] = useState("");
  const [marginJson, setMarginJson] = useState('{\n  "MONTHLY": 12,\n  "YEARLY": 10\n}');
  const [partnerEmail, setPartnerEmail] = useState("");

  const [approveIds, setApproveIds] = useState("");
  const [payoutDistId, setPayoutDistId] = useState("");
  const [payoutCommissionIds, setPayoutCommissionIds] = useState("");
  const [payoutRef, setPayoutRef] = useState("");

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

  const runReconciliation = async () => {
    setReconLoading(true);
    try {
      const res = await fetch("/api/admin/distributors/reconciliation", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Reconciliation failed");
      setRecon(j);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconciliation failed");
    } finally {
      setReconLoading(false);
    }
  };

  const createDistributor = async () => {
    try {
      let marginByPlanJson: object | undefined;
      try {
        marginByPlanJson = marginJson.trim() ? (JSON.parse(marginJson) as object) : undefined;
      } catch {
        throw new Error("Margin by plan JSON is invalid");
      }
      const res = await fetch("/api/admin/distributors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          defaultMarginPercent: newMargin,
          customerDiscountPercent: newDiscount,
          defaultMarginBasis: newMarginBasis,
          ...(marginByPlanJson ? { marginByPlanJson } : {}),
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

  const updateDistributorMargins = async () => {
    if (!editDistId) {
      toast.error("Select distributor id");
      return;
    }
    try {
      const parsed = marginJson.trim() ? (JSON.parse(marginJson) as object) : null;
      const res = await fetch(`/api/admin/distributors/${editDistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marginByPlanJson: parsed === null ? null : parsed,
          defaultMarginBasis: newMarginBasis,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      toast.success("Distributor updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const linkPartnerUser = async () => {
    if (!editDistId || !partnerEmail.trim()) {
      toast.error("Distributor id and partner email required");
      return;
    }
    try {
      const res = await fetch(`/api/admin/distributors/${editDistId}/partner-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: partnerEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Link failed");
      toast.success("Partner portal linked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    }
  };

  const approveCommissions = async () => {
    const ids = approveIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return;
    try {
      const res = await fetch("/api/admin/distributors/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionIds: ids, status: "APPROVED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Approve failed");
      toast.success(`Approved ${data.updated ?? ids.length} rows`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const recordPayout = async () => {
    const ids = payoutCommissionIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!payoutDistId || !ids.length) {
      toast.error("Distributor id and commission ids required");
      return;
    }
    try {
      const res = await fetch("/api/admin/distributors/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributorId: payoutDistId,
          commissionIds: ids,
          reference: payoutRef || undefined,
          method: "BANK",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Payout failed");
      toast.success(`Payout recorded (₹${Number(data.total ?? 0).toFixed(2)})`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payout failed");
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

  const pending = commissions.filter((c) => c.status === "PENDING");

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Distributors</h1>
          <p className="text-sm text-zinc-500">
            Partners, coupons, commissions, payouts, and Razorpay reconciliation.
          </p>
        </div>
        <Link
          href="/partner"
          className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <Link2 className="h-4 w-4" /> Partner portal preview
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reconciliation (Razorpay vs local)</CardTitle>
          <CardDescription>Compares captured payments in Razorpay to subscription billing rows (last 30 days by default).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void runReconciliation()} disabled={reconLoading}>
            {reconLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run check
          </Button>
          {recon && (
            <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
              {JSON.stringify(recon, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Export commissions (CSV)</CardTitle>
        </CardHeader>
        <CardContent>
          <a
            href="/api/admin/distributors/commissions/export"
            className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600"
          >
            <Download className="h-4 w-4" /> Download CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Approve &amp; payout</CardTitle>
          <CardDescription>
            Approve pending rows, then record a payout batch. Pending count: {pending.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Approve commission IDs (comma or newline)</Label>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-zinc-200 bg-white p-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
              value={approveIds}
              onChange={(e) => setApproveIds(e.target.value)}
              placeholder="id1, id2, ..."
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => void approveCommissions()}>
              Mark APPROVED
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Distributor ID for payout</Label>
              <Input value={payoutDistId} onChange={(e) => setPayoutDistId(e.target.value)} placeholder="cuid" className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Payment reference (optional)</Label>
              <Input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Commission IDs to pay (must be PENDING or APPROVED)</Label>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-zinc-200 bg-white p-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
              value={payoutCommissionIds}
              onChange={(e) => setPayoutCommissionIds(e.target.value)}
            />
            <Button type="button" size="sm" onClick={() => void recordPayout()}>
              Record payout
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" /> Add distributor
          </CardTitle>
          <CardDescription>Creates a partner and one coupon. Use JSON for per-plan margin overrides (optional).</CardDescription>
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
            <Label>Default margin basis</Label>
            <select
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              value={newMarginBasis}
              onChange={(e) => setNewMarginBasis(e.target.value as "LIST" | "PAID")}
            >
              <option value="LIST">LIST (catalog)</option>
              <option value="PAID">PAID (net)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-margin">Default margin %</Label>
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
            <Label htmlFor="d-disc">Customer discount %</Label>
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
          <div className="sm:col-span-2 space-y-2">
            <Label>Margin by plan (JSON, optional)</Label>
            <textarea
              className="min-h-[100px] w-full rounded-md border border-zinc-200 bg-white p-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
              value={marginJson}
              onChange={(e) => setMarginJson(e.target.value)}
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
          <CardTitle className="text-lg">Edit distributor margins &amp; partner login</CardTitle>
          <CardDescription>
            Set distributor id from the list below. Link a user email so they can open /partner.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Distributor ID</Label>
            <Input value={editDistId} onChange={(e) => setEditDistId(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label>Margin basis</Label>
            <select
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              value={newMarginBasis}
              onChange={(e) => setNewMarginBasis(e.target.value as "LIST" | "PAID")}
            >
              <option value="LIST">LIST</option>
              <option value="PAID">PAID</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Partner user email</Label>
            <Input type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Margin by plan JSON</Label>
            <textarea
              className="min-h-[100px] w-full rounded-md border border-zinc-200 bg-white p-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
              value={marginJson}
              onChange={(e) => setMarginJson(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void updateDistributorMargins()}>
              Save margins
            </Button>
            <Button type="button" size="sm" onClick={() => void linkPartnerUser()}>
              Link partner user
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" /> Coupons
          </CardTitle>
          <CardDescription>
            Tier scope, validity window, first-purchase — configure via API PATCH or DB. Listed fields shown when set.
          </CardDescription>
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
                    Discount {c.customerDiscountPercent}% · Margin {c.marginPercent}% · Basis {c.marginBasis ?? "default"} · Tiers{" "}
                    {c.allowedTiers}
                    {c.firstPurchaseOnly ? " · first purchase only" : ""}
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
            <IndianRupee className="h-5 w-5" /> Commission ledger
          </CardTitle>
          <CardDescription>Status, basis (LIST/PAID), amounts.</CardDescription>
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
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Partner</th>
                    <th className="py-2 pr-4">Workspace</th>
                    <th className="py-2 pr-4">Basis</th>
                    <th className="py-2 pr-4">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {commissions.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-xs">{r.status}</td>
                      <td className="py-2 pr-4">{r.distributorName}</td>
                      <td className="py-2 pr-4">{r.workspaceName}</td>
                      <td className="py-2 pr-4 text-xs">{r.marginBasisUsed}</td>
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
                <p className="font-mono text-xs text-zinc-500">{d.id}</p>
                <p className="font-bold">{d.name}</p>
                <p className="text-xs text-zinc-500">{d.email}</p>
                <p className="text-xs">
                  Margin {d.defaultMarginPercent}% · {d.defaultMarginBasis} · Coupons {d.couponCount} · Total ₹
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
