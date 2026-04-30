"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RoiCalculator() {
  const locale = useLocale();
  const isArabic = locale === "ar";
  const [clients, setClients] = useState(10);
  const [avgMonthlyPlan, setAvgMonthlyPlan] = useState(1499);
  const [commissionPct, setCommissionPct] = useState(12);

  const result = useMemo(() => {
    const monthlyGross = Math.max(0, clients) * Math.max(0, avgMonthlyPlan);
    const monthlyCommission = (monthlyGross * Math.max(0, commissionPct)) / 100;
    const yearlyCommission = monthlyCommission * 12;
    return { monthlyGross, monthlyCommission, yearlyCommission };
  }, [clients, avgMonthlyPlan, commissionPct]);

  return (
    <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
      <CardHeader>
        <CardTitle className="text-lg font-black">
          {isArabic ? "حاسبة عائد الشريك" : "Partner ROI calculator"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="roi-clients">{isArabic ? "العملاء النشطون" : "Active clients"}</Label>
            <Input
              id="roi-clients"
              type="number"
              min={0}
              value={clients}
              onChange={(e) => setClients(Number(e.target.value || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roi-plan">{isArabic ? "متوسط قيمة الخطة الشهرية" : "Avg monthly plan value"}</Label>
            <Input
              id="roi-plan"
              type="number"
              min={0}
              value={avgMonthlyPlan}
              onChange={(e) => setAvgMonthlyPlan(Number(e.target.value || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roi-commission">{isArabic ? "نسبة العمولة ٪" : "Commission %"}</Label>
            <Input
              id="roi-commission"
              type="number"
              min={0}
              max={100}
              value={commissionPct}
              onChange={(e) => setCommissionPct(Number(e.target.value || 0))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              {isArabic ? "إجمالي المبيعات الشهرية" : "Monthly GMV"}
            </p>
            <p className="mt-1 text-lg font-black text-zinc-900 dark:text-zinc-100">₹{result.monthlyGross.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              {isArabic ? "العمولة الشهرية" : "Monthly commission"}
            </p>
            <p className="mt-1 text-lg font-black text-emerald-700 dark:text-emerald-300">₹{result.monthlyCommission.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              {isArabic ? "العمولة السنوية" : "Yearly commission"}
            </p>
            <p className="mt-1 text-lg font-black text-indigo-700 dark:text-indigo-300">₹{result.yearlyCommission.toLocaleString("en-IN")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
