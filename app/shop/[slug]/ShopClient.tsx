"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Mail, Phone, Globe, MapPin, ShoppingCart, Check, Loader2, Sparkles,
  Info, MessageCircleQuestion, Send, ChevronDown, Megaphone, HelpCircle, Search, ArrowUpDown,
  ShieldCheck, ReceiptText, Headphones, Clock3, ImageIcon, Boxes, ClipboardList,
  CreditCard, FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Script from "next/script";
import DOMPurify from 'dompurify';

type SocialPlatform =
  | "website" | "instagram" | "facebook" | "x" | "linkedin"
  | "youtube" | "whatsapp" | "tiktok" | "pinterest" | "github" | "custom";

type SocialLink = { platform: SocialPlatform; url: string; label?: string };
type FaqEntry = { q: string; a: string };

interface ShopContent {
  announcement: string | null;
  aboutMd: string | null;
  footerNote: string | null;
  social: SocialLink[];
  faq: FaqEntry[];
  showAiAssist: boolean;
}

interface ShopData {
  shop: {
    slug: string; companyName: string; tagline: string | null; logoUrl: string | null;
    accentColor: string; email: string; phone: string | null; website: string | null; address: string;
  };
  content?: ShopContent;
  checkout: {
    available: boolean; gateway: "RAZORPAY" | "STRIPE" | null;
    razorpayKeyId: string | null; stripePublishableKey: string | null;
  };
  products: {
    id: string; name: string; description: string | null;
    imageUrl: string | null; price: number; sku: string; currentStock: number; category?: string | null;
  }[];
}

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  github: "GitHub",
  custom: "Link",
};

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  if (platform === "website" || platform === "custom") {
    return <Globe className="w-4 h-4" />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-black"
    >
      {PLATFORM_LABELS[platform].charAt(0)}
    </span>
  );
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
        body: JSON.stringify({
          items: [{ productId: product.id, quantity: 1 }],
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          buyerPhone: buyer.phone,
          buyerNote: buyer.note,
        }),
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

// ── Lightweight, sandboxed Markdown → HTML for shop About text ────────────────
// We deliberately keep a tiny converter (no third-party Markdown lib at the
// shop runtime) and run the result through DOMPurify, allowing only basic
// formatting. Any HTML-like input is escaped first, so authors can't smuggle
// raw HTML through admin.
function renderMarkdownLite(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inline = (s: string) => {
    let out = escape(s);
    out = out.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    return out;
  };

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      blocks.push(`<ul>${listBuf.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      listBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph(); flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      continue;
    }
    const liMatch = /^[-*]\s+(.*)$/.exec(line);
    if (liMatch) {
      flushParagraph();
      listBuf.push(liMatch[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return blocks.join("\n");
}

function FaqAccordion({ faq, accent }: { faq: FaqEntry[]; accent: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {faq.map((entry, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={`${entry.q}-${i}`}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{entry.q}</span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                style={{ color: accent }}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                {entry.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductDetails({
  open,
  onOpenChange,
  product,
  checkout,
  shop,
  isMobile,
  onBuyNow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ShopData["products"][0] | null;
  checkout: ShopData["checkout"];
  shop: ShopData["shop"];
  isMobile: boolean;
  onBuyNow: (product: ShopData["products"][0]) => void;
}) {
  if (!product) return null;
  const canBuy = checkout.available && product.currentStock > 0;
  const category = product.category?.trim() || "General";
  const content = (
    <>
      <div className="p-5 pt-0 space-y-4">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="h-52 w-full rounded-xl object-cover" />
        ) : (
          <div
            className="h-52 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center"
            style={{ background: `linear-gradient(145deg, ${shop.accentColor}14, ${shop.accentColor}3a)` }}
          >
            <ImageIcon className="w-10 h-10" style={{ color: shop.accentColor }} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">{category}</Badge>
          <Badge variant="outline" className="text-xs">
            {product.currentStock > 0 ? `In stock: ${product.currentStock}` : "Out of stock"}
          </Badge>
          <Badge variant="outline" className="text-xs">SKU: {product.sku}</Badge>
        </div>
        {product.description ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{product.description}</p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No extra details shared for this product yet.</p>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <p className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{formatPrice(product.price)}</p>
          {canBuy ? (
            <Button
              className="text-white font-bold"
              style={{ background: shop.accentColor }}
              onClick={() => onBuyNow(product)}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Buy now
            </Button>
          ) : (
            <a
              href={`mailto:${shop.email}?subject=${encodeURIComponent(`Enquiry: ${product.name}`)}&body=${encodeURIComponent(`Hi, I am interested in ${product.name}.`)}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <Mail className="w-4 h-4" />
              Contact us
            </a>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <DrawerHeader>
            <DrawerTitle>{product.name}</DrawerTitle>
            <DrawerDescription>Review details before checkout.</DrawerDescription>
          </DrawerHeader>
          {content}
          <DrawerFooter className="pt-0" />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl">{product.name}</DialogTitle>
            <DialogDescription>Review details before checkout.</DialogDescription>
          </DialogHeader>
        </div>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function AiAssistButton({
  shop,
  accent,
}: {
  shop: ShopData["shop"];
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", question: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.question.trim()) {
      toast.error("Please fill all fields.");
      return;
    }
    setSubmitting(true);
    const subject = `Shop Question: from ${form.name}`;
    const body = `Hi ${shop.companyName} team,\n\nA visitor asked the following from your shop question form:\n\n${form.question}\n\nReply-to: ${form.name} <${form.email}>\n`;
    try {
      window.location.href = `mailto:${shop.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      toast.success("Opening your email client with the question pre-filled.");
      setOpen(false);
      setForm({ name: "", email: "", question: "" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-2xl transition-transform active:scale-95 hover:scale-105"
        style={{ background: accent, boxShadow: `0 12px 32px ${accent}55` }}
      >
        <HelpCircle className="w-4 h-4" /> Ask a Question
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <HelpCircle className="w-5 h-5" style={{ color: accent }} /> Ask {shop.companyName}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                Drop your question and our team will get back to you. Your message goes straight to {shop.email}.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white dark:bg-zinc-950">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Name</Label>
                <Input
                  required value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Your name" className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Email</Label>
                <Input
                  required type="email" value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="you@example.com" className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Your question</Label>
              <Textarea
                required value={form.question}
                onChange={(e) => setForm((s) => ({ ...s, question: e.target.value }))}
                placeholder="e.g. Do you ship to my city? Any volume discounts?"
                rows={4}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1 text-xs font-bold uppercase tracking-widest">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 text-xs font-bold uppercase tracking-widest"
                style={{ background: accent }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Send className="w-3.5 h-3.5 mr-1.5" /> Send</>)}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Shop Client ──────────────────────────────────────────────────────────
export function ShopClient({ data }: { data: ShopData }) {
  const { shop, checkout, products, content } = data;
  const [selectedProduct, setSelectedProduct] = useState<ShopData["products"][0] | null>(null);
  const [detailsProduct, setDetailsProduct] = useState<ShopData["products"][0] | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortMode, setSortMode] = useState<"featured" | "price-asc" | "price-desc">("featured");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useConfetti(confetti);

  const aboutMd = content?.aboutMd ?? null;
  const aboutHtml = useMemo(() => {
    if (!aboutMd) return null;
    const raw = renderMarkdownLite(aboutMd);
    if (typeof window === "undefined") return raw;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["p", "h1", "h2", "h3", "ul", "ol", "li", "strong", "em", "a", "code", "br"],
      ALLOWED_ATTR: ["href", "target", "rel"],
    });
  }, [aboutMd]);

  // Apply accent color as CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty("--shop-accent", shop.accentColor);
    return () => { document.documentElement.style.removeProperty("--shop-accent"); };
  }, [shop.accentColor]);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Check for Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setConfetti(true);
      toast.success("Payment successful! Thank you for your purchase.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(products.map((product) => product.category?.trim()).filter((c): c is string => Boolean(c))),
    );
    return ["All", ...unique];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const indexed = products.map((product, idx) => ({ product, idx }));
    const filtered = indexed.filter(({ product }) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);
      const category = product.category?.trim() || "General";
      const matchesCategory = selectedCategory === "All" || category === selectedCategory;
      const matchesStock = !inStockOnly || product.currentStock > 0;
      return matchesSearch && matchesCategory && matchesStock;
    });
    if (sortMode === "price-asc") {
      return filtered.sort((a, b) => a.product.price - b.product.price).map((entry) => entry.product);
    }
    if (sortMode === "price-desc") {
      return filtered.sort((a, b) => b.product.price - a.product.price).map((entry) => entry.product);
    }
    return filtered.sort((a, b) => a.idx - b.idx).map((entry) => entry.product);
  }, [products, searchQuery, selectedCategory, inStockOnly, sortMode]);

  const featuredProduct = filteredProducts[0] ?? products[0] ?? null;
  const productSectionId = "shop-products-section";
  const accentStyles = useMemo(() => {
    return {
      glow: { boxShadow: `0 10px 40px ${shop.accentColor}30` },
      gradient: { background: `linear-gradient(135deg, ${shop.accentColor}18, ${shop.accentColor}52)` },
      softBg: { background: `${shop.accentColor}14` },
      strong: { background: shop.accentColor },
      mutedBorder: { borderColor: `${shop.accentColor}45` },
    };
  }, [shop.accentColor]);

  const browseProducts = () => {
    const el = document.getElementById(productSectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {checkout.gateway === "RAZORPAY" && (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      )}

      <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors">
        {/* ── ANNOUNCEMENT BAR ─────────────────────────────────────────────── */}
        {content?.announcement ? (
          <div
            className="w-full py-2 px-4 text-center text-xs font-semibold tracking-wide text-white"
            style={{ background: shop.accentColor }}
            role="status"
          >
            <span className="inline-flex items-center gap-2">
              <Megaphone className="w-3.5 h-3.5" />
              {content.announcement}
            </span>
          </div>
        ) : null}

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20 dark:opacity-30"
            style={{
              background: `radial-gradient(ellipse 80% 80% at 50% -20%, ${shop.accentColor}40, transparent), radial-gradient(ellipse 50% 50% at 80% 80%, ${shop.accentColor}20, transparent)`,
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

          <div className="relative max-w-6xl mx-auto px-6 py-14 md:py-20 grid gap-10 md:grid-cols-[1.05fr,0.95fr] items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold" style={accentStyles.mutedBorder}>
                <Megaphone className="w-3.5 h-3.5" style={{ color: shop.accentColor }} />
                {content?.announcement || "Trusted storefront"}
              </div>

              <div className="flex items-center gap-4">
                {shop.logoUrl ? (
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <img src={shop.logoUrl} alt={shop.companyName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black" style={accentStyles.strong}>
                    {shop.companyName.charAt(0)}
                  </div>
                )}
                <h1 className="text-4xl md:text-6xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                  {shop.companyName}
                </h1>
              </div>

              {shop.tagline && (
                <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-300 max-w-xl leading-relaxed">{shop.tagline}</p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button className="text-white font-semibold" style={accentStyles.strong} onClick={browseProducts}>
                  Browse products
                </Button>
                <Button asChild variant="outline">
                  <a href={`mailto:${shop.email}?subject=${encodeURIComponent(`Shop Question: ${shop.companyName}`)}`}>
                    <Mail className="w-4 h-4 mr-2" /> Ask a question
                  </a>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
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

            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl blur-3xl opacity-60" style={accentStyles.gradient} />
              <div className="relative rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-6 space-y-5" style={accentStyles.glow}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Storefront preview</p>
                  <Badge variant="outline" className="text-xs" style={accentStyles.mutedBorder}>
                    {checkout.available ? "Checkout enabled" : "Enquiry only"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Products</p>
                    <p className="text-2xl font-black">{products.length}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Payments</p>
                    <p className="text-sm font-bold">{checkout.gateway || "Manual support"}</p>
                  </div>
                </div>
                {featuredProduct ? (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Featured pick</p>
                    <p className="font-bold">{featuredProduct.name}</p>
                    <p className="text-sm font-semibold" style={{ color: shop.accentColor }}>{formatPrice(featuredProduct.price)}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs"><ShieldCheck className="w-3 h-3 mr-1" /> Secure payment</Badge>
                  <Badge variant="outline" className="text-xs"><ReceiptText className="w-3 h-3 mr-1" /> GST invoice</Badge>
                  <Badge variant="outline" className="text-xs"><Headphones className="w-3 h-3 mr-1" /> Business support</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 -mt-2 pb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { title: "Secure checkout", icon: ShieldCheck },
              { title: "GST-ready invoice", icon: ReceiptText },
              { title: "Direct business support", icon: Headphones },
              { title: "Fast response", icon: Clock3 },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <item.icon className="w-5 h-5 mb-2" style={{ color: shop.accentColor }} />
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{item.title}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRODUCTS ──────────────────────────────────────────────────────── */}
        <section id={productSectionId} className="max-w-6xl mx-auto px-6 py-14">
          <div className="mb-8 flex flex-col gap-4">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Shop Products
            </h2>
            <div className="grid gap-3 md:grid-cols-[1.3fr,1fr,auto]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, description, or SKU"
                  className="pl-9"
                />
              </div>
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as "featured" | "price-asc" | "price-desc")}>
                <SelectTrigger className="w-full">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured / Default</SelectItem>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
              <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3">
                <Switch checked={inStockOnly} onCheckedChange={setInStockOnly} />
                <span className="text-sm font-medium">In stock only</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    selectedCategory === category
                      ? "text-white border-transparent"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                  }`}
                  style={selectedCategory === category ? accentStyles.strong : undefined}
                >
                  {category}
                </button>
              ))}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
              Showing {filteredProducts.length} of {products.length} product{products.length !== 1 ? "s" : ""}
            </p>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/20">
              <Sparkles className="w-10 h-10 mx-auto mb-4 opacity-50" />
              <p className="font-bold text-lg text-zinc-700 dark:text-zinc-200">No products match these filters.</p>
              <p className="text-sm mt-2 mb-4">Try clearing search, category, or stock filters.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                  setSortMode("featured");
                  setInStockOnly(false);
                }}
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product, i) => (
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
                    <div
                      className="h-44 flex items-center justify-center border-b border-zinc-200/70 dark:border-zinc-800"
                      style={{ background: `linear-gradient(135deg, ${shop.accentColor}22, ${shop.accentColor}55)` }}
                    >
                      <ImageIcon className="w-9 h-9 opacity-80" style={{ color: shop.accentColor }} />
                    </div>
                  )}

                  <div className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[11px]">{product.category?.trim() || "General"}</Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {product.currentStock > 0 ? `${product.currentStock} in stock` : "Out of stock"}
                      </Badge>
                    </div>
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
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="font-semibold" onClick={() => setDetailsProduct(product)}>
                        View details
                      </Button>
                      {checkout.available && product.currentStock > 0 ? (
                        <Button
                          className="font-semibold text-white"
                          style={accentStyles.strong}
                          onClick={() => setSelectedProduct(product)}
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" /> Buy now
                        </Button>
                      ) : (
                        <Button asChild variant="outline" className="font-semibold">
                          <a href={`mailto:${shop.email}?subject=${encodeURIComponent(`Enquiry: ${product.name}`)}&body=${encodeURIComponent(`Hi, I am interested in ${product.name}.`)}`}>
                            <Mail className="w-4 h-4 mr-2" />
                            Contact us
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-8">
          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 md:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400 mb-4">How ordering works</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "Choose product", icon: Boxes },
                { title: "Add details", icon: ClipboardList },
                { title: "Pay securely / send enquiry", icon: CreditCard },
                { title: "Receive confirmation/invoice", icon: FileCheck2 },
              ].map((step, idx) => (
                <div key={step.title} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
                  <div className="inline-flex w-8 h-8 items-center justify-center rounded-lg text-xs font-black text-white" style={accentStyles.strong}>
                    {idx + 1}
                  </div>
                  <step.icon className="w-5 h-5" style={{ color: shop.accentColor }} />
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{step.title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ABOUT US ──────────────────────────────────────────────────────── */}
        {aboutHtml ? (
          <section className="max-w-4xl mx-auto px-6 py-12">
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 md:p-10">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${shop.accentColor}20`, color: shop.accentColor }}
                >
                  <Info className="w-4 h-4" />
                </div>
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                  About {shop.companyName}
                </h2>
              </div>
              <div
                className="prose prose-zinc dark:prose-invert max-w-none text-sm md:text-base leading-relaxed text-zinc-600 dark:text-zinc-300 [&_a]:text-[color:var(--shop-accent)] [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_strong]:text-zinc-900 dark:[&_strong]:text-zinc-50 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1"
                dangerouslySetInnerHTML={{ __html: aboutHtml }}
              />
            </div>
          </section>
        ) : null}

        {/* ── SOCIAL PROFILES ───────────────────────────────────────────────── */}
        {content?.social && content.social.length > 0 ? (
          <section className="max-w-5xl mx-auto px-6 py-8">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400 mb-4">
              Connect with us
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {content.social.map((link, i) => (
                <a
                  key={`${link.platform}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                  style={{ borderColor: `${shop.accentColor}30` }}
                >
                  <PlatformIcon platform={link.platform} />
                  {link.label || PLATFORM_LABELS[link.platform]}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        {content?.faq && content.faq.length > 0 ? (
          <section className="max-w-3xl mx-auto px-6 py-12">
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
                style={{ background: `${shop.accentColor}18`, color: shop.accentColor }}
              >
                <MessageCircleQuestion className="w-5 h-5" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                Frequently asked questions
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                Quick answers to what people usually ask before buying.
              </p>
            </div>
            <FaqAccordion faq={content.faq} accent={shop.accentColor} />
          </section>
        ) : null}

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <footer className="border-t border-zinc-100 dark:border-zinc-800 py-8 text-center space-y-2">
          {content?.footerNote ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto px-4">
              {content.footerNote}
            </p>
          ) : null}
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-medium">
            Powered by{" "}
            <a href="/" className="font-bold text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
              BabaBuilds ERP
            </a>
          </p>
        </footer>
      </div>

      {/* ── AI ASSIST DRAWER ────────────────────────────────────────────────── */}
      {content?.showAiAssist !== false && !selectedProduct && !detailsProduct ? (
        <AiAssistButton shop={shop} accent={shop.accentColor} />
      ) : null}

      {!selectedProduct && !detailsProduct ? (
        <div className="fixed md:hidden bottom-0 inset-x-0 z-30 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.6rem)]">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <a href={shop.phone ? `tel:${shop.phone}` : `mailto:${shop.email}`}>
                {shop.phone ? <Phone className="w-4 h-4 mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                {shop.phone ? "Call" : "Email"}
              </a>
            </Button>
            <Button className="flex-1 text-white" style={accentStyles.strong} onClick={browseProducts}>
              Browse products
            </Button>
          </div>
        </div>
      ) : null}

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

      <ProductDetails
        open={Boolean(detailsProduct)}
        onOpenChange={(open) => { if (!open) setDetailsProduct(null); }}
        product={detailsProduct}
        checkout={checkout}
        shop={shop}
        isMobile={isMobile}
        onBuyNow={(product) => {
          setDetailsProduct(null);
          setSelectedProduct(product);
        }}
      />

      {/* Shop animations */}
      <style>{`
        @keyframes shopCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </>
  );
}
