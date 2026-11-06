"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, Sparkles, CreditCard, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import {
  formatMajorInCurrency,
  getPlanPriceFromInterval,
  getPricingRegion,
  roundMajorAmount,
  type PlanInterval,
  type PricingRegion,
} from "@/lib/pricing";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loadExternalScript } from "@/lib/client/load-external-script";
import { getErrorMessage } from "@/lib/error-utils";

function SuccessUpgradeModal({ interval, onClose }: { interval: string, onClose: () => void }) {
  const isTeam = interval.includes("TEAM");
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative w-full max-w-md overflow-hidden bg-white border shadow-2xl rounded-3xl border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-900 opacity-20 pointer-events-none" />
          <div className="flex flex-col items-center p-8 text-center relative z-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
              transition={{ delay: 0.2, type: "spring" }}
              className="flex items-center justify-center w-20 h-20 mb-6 bg-indigo-100 rounded-full dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow-inner"
            >
              <PartyPopper className="w-10 h-10" />
            </motion.div>
            <h2 className="mb-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Welcome to {isTeam ? "Team" : "Pro"} Agency!
            </h2>
            <p className="mb-8 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Your payment was successful. The workspace has been upgraded, unlocking all premium features and removing limits.
            </p>
            <Button
              onClick={onClose}
              className="w-full h-12 font-bold tracking-widest text-white uppercase bg-indigo-600 rounded-xl hover:bg-indigo-700 hover:scale-[1.02] transition-transform shadow-lg shadow-indigo-500/25"
            >
              Enter Workspace
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Utility to inject the Razorpay script dynamically
const loadRazorpayScript = () => {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    void loadExternalScript("https://checkout.razorpay.com/v1/checkout.js", {
      id: "razorpay-checkout-sdk",
      timeoutMs: 10_000,
    }).then(resolve);
  });
};

export function ProUpgradeCard({
  locale = "en-IN",
  currency = "INR",
  countryCode,
  defaultInterval = "YEARLY",
}: {
  locale?: string;
  currency?: string;
  countryCode?: string | null;
  defaultInterval?: PlanInterval;
  convertDuringTrial?: boolean;
}) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [interval, setInterval] = useState<PlanInterval>(defaultInterval);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpgradeSuccess, setIsUpgradeSuccess] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [appliedDiscountPercent, setAppliedDiscountPercent] = useState<number | null>(null);

  const sessionCountry = session && "countryCode" in session ? (session as { countryCode?: string }).countryCode : undefined;
  const pricingRegion: PricingRegion = getPricingRegion({
    explicitCountryCode: countryCode ?? sessionCountry,
    explicitCurrency: currency,
    locale,
  });

  const listPlanPrice = getPlanPriceFromInterval({ interval, region: pricingRegion });
  const listMajor = listPlanPrice.amountMajor;
  const displayCurrency = listPlanPrice.currency;

  const estimatedMajor =
    appliedDiscountPercent != null && appliedDiscountPercent > 0
      ? roundMajorAmount(listMajor * (1 - Math.min(100, appliedDiscountPercent) / 100), displayCurrency)
      : listMajor;

  const loadSavedCoupon = useCallback(async () => {
    try {
      const res = await fetch("/api/distributor/apply-coupon", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.attribution) return;
      setAppliedCouponCode(data.attribution.code);
      setAppliedDiscountPercent(Number(data.attribution.customerDiscountPercent) || 0);
      setCouponInput(data.attribution.code);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadSavedCoupon();
  }, [loadSavedCoupon]);

  useEffect(() => {
    setInterval(defaultInterval);
  }, [defaultInterval]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q =
      new URLSearchParams(window.location.search).get("coupon")?.trim() ||
      new URLSearchParams(window.location.search).get("resellerCode")?.trim();
    const localCode = window.localStorage.getItem("resellerCouponCode")?.trim();
    const nextCode = q || localCode || "";
    if (nextCode) setCouponInput(nextCode);
  }, []);

  const applyCoupon = async () => {
    const toastId = toast.loading("Applying coupon...");
    try {
      const res = await fetch("/api/distributor/apply-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput.trim() || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Invalid coupon");
      if (!data.attribution) {
        setAppliedCouponCode(null);
        setAppliedDiscountPercent(null);
        setCouponInput("");
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("resellerCouponCode");
        }
        toast.success("Coupon cleared.", { id: toastId });
        return;
      }
      setAppliedCouponCode(data.attribution.code);
      setAppliedDiscountPercent(Number(data.attribution.customerDiscountPercent) || 0);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("resellerCouponCode", data.attribution.code);
      }
      toast.success("Partner coupon applied.", { id: toastId });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not apply coupon", { id: toastId });
    }
  };

  const handleUpgrade = async () => {
    setIsLoading(true);
    const toastId = toast.loading(`Initializing secure checkout...`);
    
    try {
      // 1. Load Razorpay Script
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        throw new Error("Failed to load Razorpay SDK. Please check your connection.");
      }

      // 2. Create the Order on the Backend
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval,
          distributorCouponCode: couponInput.trim() || appliedCouponCode || undefined,
          resellerCouponCode: couponInput.trim() || appliedCouponCode || undefined,
          pricingRegion,
        }),
      });
      const orderData = await orderRes.json();

      if (!orderRes.ok) throw new Error(orderData.error || "Failed to create order");

      toast.dismiss(toastId);

      // 3. Initialize Razorpay Options
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, 
        amount: orderData.amount,
        currency: orderData.currency,
        name: "BabaBuilds ERP",
        description: interval.includes("TEAM") ? `Team Plan (${interval})` : `Pro Agency Plan (${interval})`,
        order_id: orderData.id,
        prefill: {
          name: session?.user?.name || "",
          email: session?.user?.email || "",
        },
        theme: {
          color: "#4f46e5", // Indigo-600 to match your UI
        },
        handler: async function (response: RazorpaySuccessResponse) {
          const verifyToastId = toast.loading("Verifying payment securely...");
          try {
            // 4. Send the success signature back to our server to verify & upgrade DB
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                pricingRegion,
              }),
            });
            
            if (!verifyRes.ok) {
              const errData = await verifyRes.json().catch(() => ({}));
              throw new Error(errData?.error || "Verification failed");
            }

            toast.success("Payment successful! You are now a Pro user.", { id: verifyToastId });
            
            // Force a session refresh and show the new UI
            await update();
            setIsUpgradeSuccess(true);

          } catch (err: unknown) {
            toast.error(getErrorMessage(err) || "Payment verification failed", { id: verifyToastId });
          }
        }
      };

      // 5. Open the Razorpay Modal
      const paymentObject = new window.Razorpay!(options);
      paymentObject.on("payment.failed", function (response: RazorpayFailureResponse) {
        toast.error(`Payment Failed: ${response.error.description}`);
      });
      paymentObject.open();

    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "An error occurred during checkout", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isUpgradeSuccess && (
        <SuccessUpgradeModal 
          interval={interval} 
          onClose={() => {
            setIsUpgradeSuccess(false);
            router.refresh();
          }} 
        />
      )}
      <Card className="shadow-md border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/50 dark:to-zinc-900 overflow-hidden relative">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <Sparkles className="w-32 h-32 text-indigo-900 dark:text-indigo-400" />
      </div>
      
      <CardHeader className="relative z-10 border-b border-indigo-100/50 dark:border-indigo-900/50 bg-white/50 dark:bg-zinc-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-extrabold tracking-tight">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-500" /> Upgrade to Pro Agency
            </CardTitle>
            <CardDescription className="text-indigo-700/70 dark:text-indigo-400/70 mt-1 font-medium">
              Join top agencies who manage their entire operations on BabaBuilds.
            </CardDescription>
          </div>
          
          {/* INTERVAL TOGGLE */}
          <div className="flex p-1 bg-indigo-100/50 dark:bg-indigo-950/50 rounded-lg border border-indigo-200/50 dark:border-indigo-900/50 w-fit">
            <button 
              onClick={() => setInterval("MONTHLY")}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${interval === "MONTHLY" ? "bg-white dark:bg-indigo-600 text-indigo-900 dark:text-white shadow-sm" : "text-indigo-600/70 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"}`}
            >
              1-Mo
            </button>
            <button 
              onClick={() => setInterval("YEARLY")}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${interval === "YEARLY" ? "bg-white dark:bg-indigo-600 text-indigo-900 dark:text-white shadow-sm" : "text-indigo-600/70 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"}`}
            >
              12-Mo <span className="ml-1 text-emerald-600 dark:text-emerald-400 hidden sm:inline">(Save 2 months)</span>
            </button>
            <div className="w-[1px] bg-indigo-200/50 dark:bg-indigo-800/50 mx-1"></div>
            <button 
              onClick={() => setInterval("TEAM_MONTHLY")}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${interval === "TEAM_MONTHLY" ? "bg-white dark:bg-indigo-600 text-indigo-900 dark:text-white shadow-sm" : "text-indigo-600/70 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"}`}
            >
              Team 1-Mo
            </button>
            <button 
              onClick={() => setInterval("TEAM_YEARLY")}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${interval === "TEAM_YEARLY" ? "bg-white dark:bg-indigo-600 text-indigo-900 dark:text-white shadow-sm" : "text-indigo-600/70 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"}`}
            >
              Team 12-Mo
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 relative z-10 flex flex-col md:flex-row gap-6 items-center justify-between">
        <ul className="space-y-3 w-full md:w-auto">
          {[
            "Unlimited Clients & CRM",
            "Unlimited Invoices & Retainers",
            "Remove 'BabaBuilds' Watermarks",
            "Priority Email Support"
          ].map((feature, idx) => (
            <li key={idx} className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-500 shrink-0" />
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{feature}</span>
            </li>
          ))}
        </ul>
        <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-3">
           <div className="w-full max-w-sm space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Partner coupon (optional)
              </label>
              <div className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="e.g. ACME-XK2P9Q"
                  className="font-mono text-xs h-9"
                />
                <Button type="button" variant="secondary" size="sm" className="shrink-0 h-9 text-[10px] uppercase font-bold" onClick={() => void applyCoupon()}>
                  Apply
                </Button>
              </div>
           </div>
           <div className="text-center md:text-right">
              {appliedDiscountPercent != null && appliedDiscountPercent > 0 ? (
                <>
                  <p className="text-sm line-through text-zinc-400">{formatMajorInCurrency(listMajor, displayCurrency, locale)}</p>
                  <p className="text-3xl font-extrabold text-indigo-950 dark:text-zinc-50">{formatMajorInCurrency(estimatedMajor, displayCurrency, locale)}</p>
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                    {appliedDiscountPercent}% partner discount · Billed {interval.toLowerCase()}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-extrabold text-indigo-950 dark:text-zinc-50">{formatMajorInCurrency(listMajor, displayCurrency, locale)}</p>
                  <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                    Billed {interval.toLowerCase()}
                  </p>
                </>
              )}
           </div>
           <Button 
            onClick={handleUpgrade} 
            disabled={isLoading}
            size="lg" 
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wider uppercase text-xs h-11"
           >
             {isLoading ? "Processing..." : "Upgrade to Pro"}
           </Button>
           <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 dark:text-zinc-500 mt-1 flex items-center gap-1.5">
             <CreditCard className="w-3 h-3" /> Secured by Razorpay
           </p>
        </div>
      </CardContent>
    </Card>
    </>
  );
}