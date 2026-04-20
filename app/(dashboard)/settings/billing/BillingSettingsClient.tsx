"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Zap,
  CreditCard,
  Download,
  Receipt,
  Plus,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProUpgradeCard } from "@/components/UpgradeButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import {
  FREE_TIER_CLIENT_LIMIT,
  FREE_TIER_MONTHLY_INVOICE_LIMIT,
  formatPlanPrice,
  getPlanPriceFromInterval,
  getPricingRegion,
} from "@/lib/pricing";

type WorkspaceSummary = {
  planInterval: string | null;
  planTier: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | string | null;
  billingProviderId: string | null;
  countryCode: string;
  baseCurrency: string;
  _count: { clients: number };
};

type BillingHistoryItem = {
  id: string;
  date: string;
  amount: number;
  status: string;
  description: string;
  providerReference: string | null;
};

type PaymentMethod = {
  mask: string | null;
  providerCustomerId: string | null;
  provider: "RAZORPAY" | "STRIPE" | null;
};

type PaymentClientAction =
  | { type: "REDIRECT"; url?: string | null; checkoutSessionId?: string }
  | {
      type: "RAZORPAY_CHECKOUT";
      keyId: string;
      orderId: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
    };

export default function BillingSettingsClient({
  locale,
  currency,
  workspace,
}: {
  locale: string;
  currency: string;
  workspace: WorkspaceSummary;
}) {
  const { data: session } = useSession();
  const loadRazorpayScript = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return true;

    await new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

    return Boolean((window as unknown as { Razorpay?: unknown }).Razorpay);
  }, []);

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>({
    mask: null,
    providerCustomerId: workspace.billingProviderId,
    provider: null,
  });
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [subscriptionCancelled, setSubscriptionCancelled] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isPaidSubscription =
    (workspace.subscriptionStatus === "PRO" || workspace.subscriptionStatus === "TEAM") &&
    !subscriptionCancelled;
  const isTrialing = workspace.subscriptionStatus === "TRIALING" && !subscriptionCancelled;
  const clientCount = workspace._count.clients;
  const clientLimit = FREE_TIER_CLIENT_LIMIT;
  const usagePercentage = Math.min((clientCount / clientLimit) * 100, 100);

  const formatMoney = useCallback(
    (amount: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount),
    [currency, locale],
  );

  const pricingRegion = useMemo(
    () =>
      getPricingRegion({
        explicitCountryCode: workspace.countryCode,
        explicitCurrency: currency || workspace.baseCurrency,
        locale,
      }),
    [currency, locale, workspace.baseCurrency, workspace.countryCode],
  );

  const { activePriceLabel, intervalText } = useMemo(() => {
    if (isTrialing) return { activePriceLabel: "Included", intervalText: "Trial — Pro features" };
    if (!isPaidSubscription) return { activePriceLabel: formatMoney(0), intervalText: "Forever" };
    const isTeam = workspace.subscriptionStatus === "TEAM" || workspace.planTier === "TEAM";
    const fallbackInterval = isTeam ? "TEAM_MONTHLY" : "MONTHLY";
    const activeInterval = workspace.planInterval || fallbackInterval;
    const price = getPlanPriceFromInterval({ interval: activeInterval, region: pricingRegion });
    if (activeInterval === "TEAM_MONTHLY") return { activePriceLabel: formatPlanPrice(price, locale), intervalText: "Per Month (Team)" };
    if (activeInterval === "TEAM_YEARLY") return { activePriceLabel: formatPlanPrice(price, locale), intervalText: "Per Year (Team)" };
    if (activeInterval === "YEARLY") return { activePriceLabel: formatPlanPrice(price, locale), intervalText: "Per Year" };
    if (activeInterval === "QUARTERLY") return { activePriceLabel: formatPlanPrice(price, locale), intervalText: "Per Quarter" };
    return { activePriceLabel: formatPlanPrice(price, locale), intervalText: isTeam ? "Team plan" : "Per Month" };
  }, [formatMoney, isPaidSubscription, isTrialing, locale, pricingRegion, workspace.planInterval, workspace.planTier, workspace.subscriptionStatus]);

  const fetchBillingHistory = useCallback(async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const response = await fetch("/api/settings/billing/invoices", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load billing history.");
      setBillingHistory(Array.isArray(data?.items) ? data.items : []);
    } catch (error: unknown) {
      setBillingError(getErrorMessage(error, "Failed to load billing history."));
    } finally {
      setBillingLoading(false);
    }
  }, []);

  const fetchPaymentMethod = useCallback(async () => {
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const response = await fetch("/api/settings/billing/payment-method", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load payment method.");
      setPaymentMethod({
        mask: data?.paymentMethodMask || null,
        providerCustomerId: data?.providerCustomerId || workspace.billingProviderId || null,
        provider: data?.provider || null,
      });
    } catch (error: unknown) {
      setPaymentError(getErrorMessage(error, "Failed to load payment method."));
    } finally {
      setPaymentLoading(false);
    }
  }, [workspace.billingProviderId]);

  useEffect(() => {
    void fetchBillingHistory();
    void fetchPaymentMethod();
  }, [fetchBillingHistory, fetchPaymentMethod]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = new URLSearchParams(window.location.search);
    const setupState = query.get("pm_setup");
    const checkoutSessionId = query.get("session_id");

    if (setupState !== "stripe_success" || !checkoutSessionId) return;

    const finalizeStripe = async () => {
      try {
        const response = await fetch("/api/settings/billing/payment-method", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "STRIPE",
            checkoutSessionId,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Stripe confirmation failed.");
        }
        await fetchPaymentMethod();
      } catch (error: unknown) {
        setPaymentError(getErrorMessage(error, "Stripe confirmation failed."));
      } finally {
        query.delete("pm_setup");
        query.delete("session_id");
        const cleaned = query.toString();
        window.history.replaceState({}, "", cleaned ? `${window.location.pathname}?${cleaned}` : window.location.pathname);
      }
    };

    void finalizeStripe();
  }, [fetchPaymentMethod]);

  const handleCancelSubscription = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch("/api/settings/billing/subscription/cancel", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to cancel subscription.");
      setSubscriptionCancelled(true);
    } catch (error: unknown) {
      setCancelError(getErrorMessage(error, "Failed to cancel subscription."));
    } finally {
      setCancelling(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    setAddingPaymentMethod(true);
    setPaymentError(null);
    try {
      const response = await fetch("/api/settings/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to add a payment method right now.");

      const clientAction = data?.clientAction as PaymentClientAction | undefined;
      if (!clientAction) {
        await fetchPaymentMethod();
        return;
      }

      if (clientAction.type === "REDIRECT") {
        if (!clientAction.url) throw new Error("Stripe setup redirect URL is missing.");
        window.location.href = clientAction.url;
        return;
      }

      if (clientAction.type === "RAZORPAY_CHECKOUT") {
        const loaded = await loadRazorpayScript();
        if (!loaded) throw new Error("Failed to load Razorpay checkout. Please try again.");

        const RazorpayCtor = (window as unknown as { Razorpay?: new (options: unknown) => { open: () => void } }).Razorpay;
        if (!RazorpayCtor) throw new Error("Razorpay SDK unavailable.");

        const paymentObject = new RazorpayCtor({
          key: clientAction.keyId,
          amount: clientAction.amount,
          currency: clientAction.currency,
          name: clientAction.name,
          description: clientAction.description,
          order_id: clientAction.orderId,
          prefill: {
            name: session?.user?.name || "",
            email: session?.user?.email || "",
          },
          handler: async (gatewayResponse: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            const finalizeRes = await fetch("/api/settings/billing/payment-method", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: "RAZORPAY",
                ...gatewayResponse,
              }),
            });
            const finalizeData = await finalizeRes.json();
            if (!finalizeRes.ok) {
              throw new Error(finalizeData?.error || "Razorpay confirmation failed.");
            }
            await fetchPaymentMethod();
          },
        });

        paymentObject.open();
        return;
      }

      await fetchPaymentMethod();
    } catch (error: unknown) {
      setPaymentError(getErrorMessage(error, "Unable to add a payment method right now."));
    } finally {
      setAddingPaymentMethod(false);
    }
  };

  const handleDownload = async (transactionId: string) => {
    setDownloadingId(transactionId);
    setBillingError(null);
    try {
      const response = await fetch(`/api/settings/billing/invoices/${transactionId}/receipt`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.downloadUrl) {
        throw new Error(data?.error || "Could not prepare receipt download.");
      }
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error: unknown) {
      setBillingError(getErrorMessage(error, "Could not prepare receipt download."));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="sticky top-0 z-30 -mx-4 px-4 py-6 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300 text-center space-y-2 mb-10">
          <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900/20 mb-4 transition-transform hover:scale-105">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">Billing & Plan</h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-sm font-medium">
            Manage your subscription tier, payment methods, and download past receipts.
          </p>
        </div>

        <div className="space-y-8">
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50 font-extrabold">
                <Zap className="w-5 h-5 text-indigo-600" /> Current Subscription
              </CardTitle>
              <CardDescription className="dark:text-zinc-400 font-medium">Your active plan and system limits.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {isTrialing
                        ? "Trial — full paid features"
                        : isPaidSubscription
                          ? workspace.subscriptionStatus === "TEAM" || workspace.planTier === "TEAM"
                            ? `Team Plan (${workspace.planInterval || "TEAM_MONTHLY"})`
                            : `Pro Plan (${workspace.planInterval || "YEARLY"})`
                          : "Free Plan"}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest ${
                      isPaidSubscription || isTrialing
                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                    }`}>
                      {subscriptionCancelled ? "CANCELLED" : workspace.subscriptionStatus}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                    {isTrialing
                      ? `Your trial ends on ${
                          workspace.subscriptionEndsAt
                            ? new Date(workspace.subscriptionEndsAt).toLocaleDateString(locale)
                            : "—"
                        }. You have full Pro/Team features during the trial.`
                      : isPaidSubscription
                        ? `Your subscription auto-renews on ${
                            workspace.subscriptionEndsAt
                              ? new Date(workspace.subscriptionEndsAt).toLocaleDateString(locale)
                              : "next billing cycle"
                          }.`
                        : "One workspace per account. Free tier includes limited clients and invoices per month."}
                  </p>
                  {cancelError && (
                    <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                      {cancelError} <button onClick={handleCancelSubscription} className="underline">Retry</button>
                    </p>
                  )}
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-3xl font-black text-zinc-900 dark:text-zinc-50">
                    {isPaidSubscription || isTrialing ? activePriceLabel : formatMoney(0)}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">
                    {(isPaidSubscription || isTrialing) ? intervalText : `${FREE_TIER_MONTHLY_INVOICE_LIMIT} invoices/mo limit`}
                  </p>
                </div>
              </div>

              {!isPaidSubscription && !isTrialing && (
                <>
                  <Separator className="dark:bg-zinc-800" />
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Client CRM Usage</h3>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-1">You are using {clientCount} out of {clientLimit} free clients.</p>
                      </div>
                      <span className={`text-sm font-bold ${clientCount >= clientLimit ? "text-rose-600 dark:text-rose-500" : "text-zinc-700 dark:text-zinc-300"}`}>
                        {clientCount} / {clientLimit}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-zinc-200/50 dark:border-zinc-700">
                      <div className={`h-full rounded-full transition-all duration-1000 ${clientCount >= clientLimit ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${usagePercentage}%` }} />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            {isPaidSubscription && (
              <CardFooter className="bg-zinc-50 dark:bg-zinc-950/50 border-t dark:border-zinc-800 p-4">
                <Button
                  variant="outline"
                  disabled={cancelling}
                  onClick={handleCancelSubscription}
                  className="w-full sm:w-auto text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-500 dark:hover:bg-rose-900/20 text-xs font-bold uppercase tracking-widest"
                >
                  {cancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {cancelling ? "Cancelling..." : "Cancel Subscription"}
                </Button>
              </CardFooter>
            )}
          </Card>

          {!isPaidSubscription && !isTrialing && (
            <ProUpgradeCard locale={locale} currency={currency} countryCode={workspace.countryCode} />
          )}

          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50 font-extrabold">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-500" /> Payment Vault
              </CardTitle>
              <CardDescription className="dark:text-zinc-400 font-medium">Manage how you pay for your subscription.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {paymentLoading ? (
                <div className="text-sm text-zinc-500">Loading payment methods...</div>
              ) : paymentError ? (
                <div className="text-sm text-rose-600">
                  {paymentError} <button onClick={fetchPaymentMethod} className="underline">Try again</button>
                </div>
              ) : paymentMethod.mask ? (
                <div className="flex items-center justify-between p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-sm">
                      <CreditCard className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">{paymentMethod.mask}</p>
                      <p className="text-xs uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Primary Method {paymentMethod.providerCustomerId ? `• ${paymentMethod.providerCustomerId}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-bold uppercase tracking-widest border-none">Active</Badge>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/30">
                  <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">No payment methods saved.</p>
                  <p className="text-xs text-zinc-500 mt-1">Add one to avoid renewal issues.</p>
                </div>
              )}

              <Button
                variant="outline"
                disabled={addingPaymentMethod}
                onClick={handleAddPaymentMethod}
                className="mt-4 w-full sm:w-auto text-xs font-bold uppercase tracking-widest dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {addingPaymentMethod ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                {addingPaymentMethod ? "Adding..." : "Add Payment Method"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50 font-extrabold">
                <Receipt className="w-5 h-5 text-zinc-600 dark:text-zinc-400" /> Billing History
              </CardTitle>
              <CardDescription className="dark:text-zinc-400 font-medium">Download past invoices and receipts for your records.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {billingLoading ? (
                <div className="p-12 text-center text-sm text-zinc-500">Loading billing history...</div>
              ) : billingError ? (
                <div className="p-12 text-center text-sm text-rose-600">
                  {billingError}
                  <div className="mt-3">
                    <Button variant="outline" onClick={fetchBillingHistory}>Retry</Button>
                  </div>
                </div>
              ) : billingHistory.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto mb-4">
                    <Receipt className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
                  </div>
                  <p className="text-zinc-900 dark:text-zinc-200 font-bold uppercase tracking-widest text-sm">No billing history yet.</p>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">Your receipts will appear here once a billing event is recorded.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
                      <tr>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {billingHistory.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">{inv.date}</td>
                          <td className="px-6 py-4 text-xs text-zinc-900 dark:text-zinc-100 font-bold">{inv.description}</td>
                          <td className="px-6 py-4 text-xs font-black text-indigo-700 dark:text-indigo-400">{formatMoney(inv.amount)}</td>
                          <td className="px-6 py-4">
                            <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-widest">
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDownload(inv.id)}
                              disabled={downloadingId === inv.id}
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 p-2 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-60"
                            >
                              {downloadingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
