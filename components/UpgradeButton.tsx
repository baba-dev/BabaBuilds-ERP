"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, Sparkles, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { getCurrencySymbol } from "@/lib/currency";
import { useSession } from "next-auth/react";

// Utility to inject the Razorpay script dynamically
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export function ProUpgradeCard({ locale = "en-IN", currency = "INR" }: { locale?: string, currency?: string }) {
  const { data: session, update } = useSession();
  const [interval, setInterval] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("YEARLY");
  const [isLoading, setIsLoading] = useState(false);

  const currencySymbol = getCurrencySymbol(currency, locale);

  const pricing = {
    MONTHLY: 200,
    QUARTERLY: 550,
    YEARLY: 2300
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(locale, { 
      style: 'currency', 
      currency: currency, 
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
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
        body: JSON.stringify({ interval }),
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
        description: `Pro Agency Plan (${interval})`,
        order_id: orderData.id,
        prefill: {
          name: session?.user?.name || "",
          email: session?.user?.email || "",
        },
        theme: {
          color: "#4f46e5", // Indigo-600 to match your UI
        },
        handler: async function (response: any) {
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
                interval: interval
              }),
            });
            
            if (!verifyRes.ok) throw new Error("Verification failed");

            toast.success("Payment successful! You are now a Pro user.", { id: verifyToastId });
            
            // Force a session refresh and reload the page to show the new UI
            await update();
            window.location.reload();

          } catch (err: any) {
            toast.error(err.message || "Payment verification failed", { id: verifyToastId });
          }
        }
      };

      // 5. Open the Razorpay Modal
      const paymentObject = new (window as any).Razorpay(options);
      paymentObject.on("payment.failed", function (response: any) {
        toast.error(`Payment Failed: ${response.error.description}`);
      });
      paymentObject.open();

    } catch (error: any) {
      toast.error(error.message || "An error occurred during checkout", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
              onClick={() => setInterval("QUARTERLY")}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${interval === "QUARTERLY" ? "bg-white dark:bg-indigo-600 text-indigo-900 dark:text-white shadow-sm" : "text-indigo-600/70 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"}`}
            >
              3-Mo
            </button>
            <button 
              onClick={() => setInterval("YEARLY")}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${interval === "YEARLY" ? "bg-white dark:bg-indigo-600 text-indigo-900 dark:text-white shadow-sm" : "text-indigo-600/70 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"}`}
            >
              12-Mo <span className="ml-1 text-emerald-600 dark:text-emerald-400 hidden sm:inline">(Save 5%)</span>
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
           <div className="text-center md:text-right">
              <p className="text-3xl font-extrabold text-indigo-950 dark:text-zinc-50">{formatMoney(pricing[interval])}</p>
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                Billed {interval.toLowerCase()}
              </p>
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
  );
}