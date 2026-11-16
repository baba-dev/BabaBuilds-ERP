"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Building2, Ticket, IndianRupee } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type PartnerPayload = {
  distributor: { id: string; name: string; email: string; status: string };
  counts: { attributions: number; commissions: number };
  outstandingCommission: number;
  paidCommission: number;
  coupons: Array<{
    id: string;
    code: string;
    isActive: boolean;
    usedCount: number;
    maxUses: number | null;
    customerDiscountPercent: number;
    marginPercent: number;
  }>;
  recentCommissions: Array<{
    id: string;
    createdAt: string;
    status: string;
    workspaceName: string;
    couponCode: string | null;
    commissionAmount: number;
  }>;
};

export default function PartnerPortalPage() {
  const t = useTranslations("PartnerPortal");
  const { status } = useSession();
  const [data, setData] = useState<PartnerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/distributor", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center gap-2 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{error || t('loadFailed')}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {t('accessNote')}
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-bold text-indigo-600">
          {t('back')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Building2 className="h-4 w-4" /> {data.distributor.name}
            </CardTitle>
            <CardDescription className="text-xs">{data.distributor.email}</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-zinc-600">
            {t('attributed', { count: data.counts.attributions })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">{t('outstanding')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
            ₹{data.outstandingCommission.toFixed(2)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">{t('paid')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black">₹{data.paidCommission.toFixed(2)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" /> {t('coupons')}
          </CardTitle>
          <CardDescription>{t('couponsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.coupons.map((c) => (
            <div key={c.id} className="rounded-lg border border-zinc-200 p-3 font-mono text-sm dark:border-zinc-800">
              <span className="font-bold">{c.code}</span>
              <span className="ms-2 text-xs text-zinc-500">
                {c.isActive ? t('active') : t('inactive')} · {t('used', { count: c.usedCount })}
                {c.maxUses != null ? ` / ${c.maxUses}` : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <IndianRupee className="h-5 w-5" /> {t('recent')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto text-sm">
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2">{t('date')}</th>
                  <th className="py-2">{t('workspace')}</th>
                  <th className="py-2">{t('status')}</th>
                  <th className="py-2">{t('amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.recentCommissions.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="py-2">{r.workspaceName}</td>
                    <td className="py-2 text-xs">{r.status}</td>
                    <td className="py-2 font-semibold">₹{r.commissionAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
