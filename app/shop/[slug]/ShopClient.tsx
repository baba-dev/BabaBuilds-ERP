"use client";

import { useState, useEffect } from "react";
import { Mail, Phone, Globe, MapPin, ShoppingCart, X, Check, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import Script from "next/script";
import DOMPurify from 'dompurify';

interface ShopData {
  shop: {
    slug: string; companyName: string; tagline: string | null; logoUrl: string | null;
    accentColor: string; email: string; phone: string | null; website: string | null; address: string;
  };
  checkout: {
    available: boolean; gateway: "RAZORPAY" | "STRIPE" | null;
    razorpayKeyId: string | null; stripePublishableKey: string | null;
  };
  products: {
    id: string; name: string; description: string | null;
    imageUrl: string | null; price: number; sku: string; currentStock: number;
  }[];
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(price);

// ── Confetti ──────────────────────────────────────────────────────────────────
function useConfetti(trigger: boolean) {
  useEffect(() => {
    if (!trigger) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20,
      r: Math.random() * 6 + 4,
      d: Math.random() * 60,
      color: ["#6366f1","#10b981","#f59e0b","#ec4899","#3b82f6","#a855f7"][Math.floor(Math.random() * 6)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncrement: Math.random() * 0.07 + 0.05,
      tiltAngle: 0,
    }));
    let frame = 0;
    const raf = requestAnimationFrame(function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.tiltAngle += p.tiltAngleIncrement;
        p.y += (Math.cos(frame / 10 + p.d) + p.r / 2) * 2;
        p.x += Math.sin(frame / 10) * 1.5;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.ellipse(p.x, p.y, p.r, p.r / 2, (p.tilt * Math.PI) / 180, 0, Math.PI * 2);
        ctx.fill();
      });
      frame++;
      if (frame < 180) requestAnimationFrame(loop);
      else document.body.removeChild(canvas);
    });
    return () => { cancelAnimationFrame(raf); };
  }, [trigger]);
}

// ── Buy Modal ─────────────────────────────────────────────────────────────────
function BuyModal({
  product, slug, checkout, onClose, onSuccess,
}: {
  product: ShopData["products"][0];
  slug: string;
  checkout: ShopData["checkout"];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"form" | "processing" | "success">("form");
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "", note: "" });
  const [loading, setLoading] = useState(false);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res  = await fetch(`/api/shop/${slug}/order`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], ...buyer }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to start checkout."); setLoading(false); return; }

      if (data.gateway === "STRIPE") {
        window.location.href = data.sessionUrl;
        return;
      }

      if (data.gateway === "RAZORPAY") {
        setStep("processing");
        const rzp = new (window as any).Razorpay({
          key:         data.keyId,
          amount:      data.amount,
          currency:    data.currency,
          order_id:    data.rpOrderId,
          name:        data.shopName,
          description: product.name,
          prefill:     data.prefill,
          theme:       { color: "#6366f1" },
          handler: async (response: any) => {
            const verifyRes = await fetch(`/api/shop/${slug}/verify`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                shopOrderId: data.orderId,
                razorpayOrderId:   response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            if (verifyRes.ok) { setStep("success"); onSuccess(); }
            else { toast.error("Payment verification failed. Please contact support."); setStep("form"); }
          },
          modal: { ondismiss: () => setStep("form") },
        });
        rzp.open();
        setLoading(false);
      }
    } catch {
      toast.error("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl">
        {step === "success" ? (
          <div className="p-10 text-center space-y-4 bg-white dark:bg-zinc-950">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">Payment Successful!</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
              Thank you for your purchase of <strong>{product.name}</strong>. An invoice has been prepared and will be shared with you shortly.
            </p>
            <Button onClick={onClose} className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8">Close</Button>
          </div>
        ) : step === "processing" ? (
          <div className="p-10 text-center space-y-4 bg-white dark:bg-zinc-950">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto" />
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Processing your payment...</p>
          </div>
        ) : (
          <>
            <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Purchase — {product.name}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                  Enter your details to complete the checkout.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/30 rounded-xl flex items-center justify-between">
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{product.name}</span>
                <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">{formatPrice(product.price)}</span>
              </div>
            </div>
            <form onSubmit={handleBuy} className="p-6 space-y-4 bg-white dark:bg-zinc-950">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Full Name <span className="text-rose-500">*</span></Label>
                  <Input required value={buyer.name} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} placeholder="Your name" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Email <span className="text-rose-500">*</span></Label>
                  <Input type="email" required value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} placeholder="you@example.com" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Phone</Label>
                  <Input value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} placeholder="+91 98765..." className="h-10" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Message / Requirements</Label>
                  <Textarea value={buyer.note} onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))} placeholder="Any specific requirements or notes..." rows={3} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1 text-xs font-bold uppercase tracking-widest">Cancel</Button>
                <Button type="submit" disabled={loading} className="flex-1 text-xs font-bold uppercase tracking-widest" style={{ background: "#6366f1" }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${formatPrice(product.price)}`}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Shop Client ──────────────────────────────────────────────────────────
export function ShopClient({ data }: { data: ShopData }) {
  const { shop, checkout, products } = data;
  const [selectedProduct, setSelectedProduct] = useState<ShopData["products"][0] | null>(null);
  const [confetti, setConfetti] = useState(false);

  useConfetti(confetti);

  // Apply accent color as CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty("--shop-accent", shop.accentColor);
    return () => { document.documentElement.style.removeProperty("--shop-accent"); };
  }, [shop.accentColor]);

  // Check for Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setConfetti(true);
      toast.success("Payment successful! Thank you for your purchase.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <>
      {checkout.gateway === "RAZORPAY" && (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      )}

      <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors">
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Animated gradient mesh */}
          <div
            className="absolute inset-0 opacity-20 dark:opacity-30"
            style={{
              background: `radial-gradient(ellipse 80% 80% at 50% -20%, ${shop.accentColor}40, transparent), radial-gradient(ellipse 50% 50% at 80% 80%, ${shop.accentColor}20, transparent)`,
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

          <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
            {/* Logo */}
            {shop.logoUrl ? (
              <div className="shop-float mx-auto w-24 h-24 rounded-2xl overflow-hidden border-4 border-white dark:border-zinc-800 shadow-xl shadow-black/10 mb-6">
                <img src={shop.logoUrl} alt={shop.companyName} className="w-full h-full object-contain bg-white" />
              </div>
            ) : (
              <div className="shop-float mx-auto w-24 h-24 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl mb-6"
                style={{ background: shop.accentColor }}>
                {shop.companyName.charAt(0)}
              </div>
            )}

            <h1 className="shop-rise text-4xl md:text-6xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
              {shop.companyName}
            </h1>
            {shop.tagline && (
              <p className="shop-rise-delay text-lg md:text-xl text-zinc-500 dark:text-zinc-400 font-medium max-w-2xl mx-auto mb-8 leading-relaxed">
                {shop.tagline}
              </p>
            )}

            {/* Contact strip */}
            <div className="shop-rise-delay flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
              {shop.phone && (
                <a href={`tel:${shop.phone}`} className="flex items-center gap-1.5 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                  <Phone className="w-4 h-4" /> {shop.phone}
                </a>
              )}
              <a href={`mailto:${shop.email}`} className="flex items-center gap-1.5 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                <Mail className="w-4 h-4" /> {shop.email}
              </a>
              {shop.website && (
                <a href={shop.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                  <Globe className="w-4 h-4" /> {shop.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> {shop.address}
              </span>
            </div>
          </div>
        </section>

        {/* ── PRODUCTS ──────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
              Shop Products
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">
              {products.length} product{products.length !== 1 ? "s" : ""} available
            </p>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-20 text-zinc-400">
              <Sparkles className="w-10 h-10 mx-auto mb-4 opacity-50" />
              <p className="font-bold text-lg">No products available yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product, i) => (
                <div
                  key={product.id}
                  id={`product-${product.id}`}
                  className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300"
                  style={{ animationDelay: `${i * 80}ms`, animation: "shopCardIn 0.5s ease both" }}
                >
                  {/* Hero image */}
                  {product.imageUrl ? (
                    <div className="h-44 overflow-hidden">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${shop.accentColor}15, ${shop.accentColor}30)` }}>
                      <Sparkles className="w-8 h-8 opacity-40" style={{ color: shop.accentColor }} />
                    </div>
                  )}

                  <div className="p-5 space-y-3">
                    <h3 className="font-extrabold text-zinc-900 dark:text-zinc-50 text-lg tracking-tight leading-tight">{product.name}</h3>

                    {product.description && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      SKU {product.sku} · Stock {product.currentStock}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">
                        {formatPrice(product.price)}
                      </span>

                      {checkout.available && product.currentStock > 0 ? (
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95 hover:opacity-90 shadow-lg"
                          style={{ background: shop.accentColor, boxShadow: `0 4px 15px ${shop.accentColor}40` }}
                        >
                          <ShoppingCart className="w-4 h-4" /> Buy Now
                        </button>
                      ) : (
                        <a
                          href={`mailto:${shop.email}?subject=Enquiry: ${encodeURIComponent(product.name)}&body=Hi, I am interested in ${encodeURIComponent(product.name)}.`}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                        >
                          <Mail className="w-4 h-4" /> Contact Us
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <footer className="border-t border-zinc-100 dark:border-zinc-800 py-8 text-center">
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-medium">
            Powered by{" "}
            <a href="/" className="font-bold text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
              BabaBuilds ERP
            </a>
          </p>
        </footer>
      </div>

      {/* Buy Modal */}
      {selectedProduct && (
        <BuyModal
          product={selectedProduct}
          slug={shop.slug}
          checkout={checkout}
          onClose={() => setSelectedProduct(null)}
          onSuccess={() => { setConfetti(true); setSelectedProduct(null); }}
        />
      )}

      {/* Shop animations */}
      <style>{`
        @keyframes shopFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes shopRise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shopCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .shop-float  { animation: shopFloat 4s ease-in-out infinite; }
        .shop-rise   { animation: shopRise 0.6s ease both; }
        .shop-rise-delay { animation: shopRise 0.6s 0.15s ease both; }
      `}</style>
    </>
  );
}
