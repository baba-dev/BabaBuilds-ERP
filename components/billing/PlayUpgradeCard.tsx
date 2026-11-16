"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPlayPlans, purchasePlayPlan, PlayPurchaseCancelledError, type PlayPlanDetails } from "@/lib/client/play-billing";
import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";

const INTERVAL_LABEL: Record<SubscriptionIntervalKey, string> = {
  MONTHLY: "Pro · Monthly",
  QUARTERLY: "Pro · Quarterly",
  YEARLY: "Pro · Yearly",
  TEAM_MONTHLY: "Team · Monthly",
  TEAM_YEARLY: "Team · Yearly",
};
const INTERVALS = Object.keys(INTERVAL_LABEL) as SubscriptionIntervalKey[];

function formatPrice(price: { currency: string; value: string }): string {
  const value = Number(price.value);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency }).format(value);
  } catch {
    return `${price.currency} ${price.value}`;
  }
}

async function verifyOnServer(purchaseToken: string): Promise<{ pending: boolean }> {
  const res = await fetch("/api/billing/play/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purchaseToken }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; pending?: boolean };
  if (!res.ok) throw new Error(data.error || "Could not verify the purchase. You have not been charged twice; please retry.");
  return { pending: Boolean(data.pending) };
}

/**
 * Upgrade UI shown INSIDE the Android app, in place of Razorpay/Stripe checkout. Google Play policy requires
 * Play Billing for in-app subscriptions, so this screen offers no coupons, web checkout or external payment links.
 */
export function PlayUpgradeCard() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlayPlanDetails[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buying, setBuying] = useState<SubscriptionIntervalKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPlayPlans(INTERVALS)
      .then((p) => !cancelled && setPlans(p))
      .catch(() => !cancelled && setLoadError("Could not load plans from Google Play. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, []);

  const buy = async (interval: SubscriptionIntervalKey) => {
    setBuying(interval);
    try {
      let pending = false;
      await purchasePlayPlan(interval, async (token) => {
        pending = (await verifyOnServer(token)).pending;
      });
      toast.success(pending ? "Payment pending. Your plan activates as soon as Google confirms it." : "Subscription active. Thank you!");
      router.refresh();
    } catch (error) {
      if (!(error instanceof PlayPurchaseCancelledError)) {
        toast.error(error instanceof Error ? error.message : "Purchase failed.");
      }
    } finally {
      setBuying(null);
    }
  };

  return (
    <Card className="border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-zinc-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-extrabold">
          <CreditCard className="size-5 text-indigo-600" aria-hidden /> Upgrade with Google Play
        </CardTitle>
        <CardDescription>Billed and managed by Google Play. Cancel any time in Play Store &gt; Subscriptions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {plans === null && !loadError && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading plans…
          </p>
        )}
        {loadError && <p role="alert" className="text-sm font-medium text-rose-600">{loadError}</p>}
        {plans?.length === 0 && <p className="text-sm text-muted-foreground">Plans are not available in this version of the app yet.</p>}
        {plans?.map((plan) => (
          <div key={plan.sku} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{INTERVAL_LABEL[plan.interval]}</p>
              <p className="text-sm text-muted-foreground">{formatPrice(plan.price)}</p>
            </div>
            <Button type="button" disabled={buying !== null} onClick={() => void buy(plan.interval)} className="shrink-0">
              {buying === plan.interval ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Subscribe"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
