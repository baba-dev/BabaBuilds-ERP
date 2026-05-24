"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { m, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Handshake,
  LifeBuoy,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";
import FloatingPreferencesWidget from "@/components/landing/FloatingPreferencesWidget";
import TurnstileWidget from "@/components/TurnstileWidget";
import {
  formatMajorInCurrency,
  getPlanPriceFromInterval,
  roundMajorAmount,
  type PlanInterval,
  type PricingRegion,
} from "@/lib/pricing";

const planIntervals: Array<{ interval: PlanInterval; label: string }> = [
  { interval: "MONTHLY", label: "الاحترافية شهري" },
  { interval: "YEARLY", label: "الاحترافية سنوي" },
  { interval: "TEAM_MONTHLY", label: "الفريق شهري" },
  { interval: "TEAM_YEARLY", label: "الفريق سنوي" },
];

const partnerTypes = [
  "استشاريون يديرون العمليات وأدوات المالية لعملائهم",
  "مكاتب محاسبة ومحاسبين قانونيين تقدم التنفيذ والاستشارات",
  "وكالات رقمية وأتمتة تعمل بنظام الاشتراكات المتكررة",
  "شركاء تقنيون محليون يقودون إطلاق ERP للشركات الصغيرة والمتوسطة",
];

const supportItems = [
  { label: "عرض مبيعات قابل للتنزيل", href: "/api/reseller/partner-kit/sales-deck.pdf" },
  { label: "ورقة أسعار من صفحة واحدة", href: "/api/reseller/partner-kit/pricing-sheet.pdf" },
  { label: "نص جاهز للتواصل عبر واتساب", href: "/api/reseller/partner-kit/whatsapp-script.pdf" },
  { label: "ورقة معالجة الاعتراضات", href: "/api/reseller/partner-kit/objection-sheet.pdf" },
  { label: "قائمة التحقق لبدء التشغيل", href: "/api/reseller/partner-kit/onboarding-checklist.pdf" },
  { label: "حاسبة العائد + موارد الشريك", href: "/reseller/partner-kit" },
];

type CouponState = {
  code: string;
  discountPercent: number;
  resellerName: string;
  commissionPercent: number;
};

type QueryFormState = {
  fullName: string;
  email: string;
  company: string;
  phone: string;
  website: string;
  monthlyClientLeads: string;
  budgetBand: string;
  message: string;
  honeypot: string;
};

const initialQueryState: QueryFormState = {
  fullName: "",
  email: "",
  company: "",
  phone: "",
  website: "",
  monthlyClientLeads: "",
  budgetBand: "",
  message: "",
  honeypot: "",
};

export default function ResellerLandingClient() {
  const t = useTranslations("ResellerLanding");
  const locale = useLocale();
  const isArabic = locale.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const [selectedInterval, setSelectedInterval] = useState<PlanInterval>("YEARLY");
  const [pricingRegion, setPricingRegion] = useState<PricingRegion>("IN");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [queryForm, setQueryForm] = useState<QueryFormState>(initialQueryState);
  const [submittingQuery, setSubmittingQuery] = useState(false);
  const [queryTurnstileToken, setQueryTurnstileToken] = useState("");

  const selectedPlan = useMemo(
    () => getPlanPriceFromInterval({ interval: selectedInterval, region: pricingRegion }),
    [selectedInterval, pricingRegion],
  );

  const discountedAmount = useMemo(() => {
    if (!coupon) return selectedPlan.amountMajor;
    return roundMajorAmount(
      selectedPlan.amountMajor * (1 - Math.min(100, Math.max(0, coupon.discountPercent)) / 100),
      selectedPlan.currency,
    );
  }, [coupon, selectedPlan.amountMajor, selectedPlan.currency]);

  const onApplyCoupon = async (e: FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      toast.error(t("toasts.enterCoupon"));
      return;
    }

    setApplyingCoupon(true);
    try {
      const res = await fetch("/api/reseller/coupon/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("toasts.couponVerifyFailed"));

      setCoupon({
        code: data.coupon.code,
        discountPercent: Number(data.coupon.discountPercent) || 0,
        resellerName: data.coupon.resellerName,
        commissionPercent: Number(data.coupon.commissionPercent) || 0,
      });
      setCouponInput(data.coupon.code);
      if (typeof window !== "undefined") {
        const next = new URL(window.location.href);
        next.searchParams.set("resellerCode", data.coupon.code);
        window.history.replaceState({}, "", next.toString());
        window.localStorage.setItem("resellerCouponCode", data.coupon.code);
      }
      toast.success(t("toasts.couponApplied", { resellerName: data.coupon.resellerName }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.couponApplyFailed"));
    } finally {
      setApplyingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setCoupon(null);
    setCouponInput("");
    if (typeof window !== "undefined") {
      const next = new URL(window.location.href);
      next.searchParams.delete("resellerCode");
      window.history.replaceState({}, "", next.toString());
      window.localStorage.removeItem("resellerCouponCode");
    }
  };

  const onSubmitQuery = async (e: FormEvent) => {
    e.preventDefault();
    if (!queryTurnstileToken) {
      toast.error(t("toasts.completeSecurity"));
      return;
    }
    setSubmittingQuery(true);
    try {
      const monthlyClientLeads = Number(queryForm.monthlyClientLeads);
      const payload = {
        ...queryForm,
        monthlyClientLeads: Number.isFinite(monthlyClientLeads) ? monthlyClientLeads : undefined,
        turnstileToken: queryTurnstileToken,
      };

      const res = await fetch("/api/reseller/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("toasts.querySubmitFailed"));
      setQueryForm(initialQueryState);
      setQueryTurnstileToken("");
      toast.success(t("toasts.querySubmitted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.querySubmitFailed"));
    } finally {
      setSubmittingQuery(false);
    }
  };

  const checkoutHref = coupon?.code
    ? `/settings/billing?resellerCode=${encodeURIComponent(coupon.code)}`
    : "/settings/billing";

  return (
    <div className="overflow-x-hidden bg-surface-base">
      <LandingNavbar />
      <main>
        <section className="relative min-h-[min(100vh,920px)] px-6 pb-16 pt-28 md:pt-32">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[620px] w-[1000px] -translate-x-1/2 rounded-full bg-accent-soft blur-[130px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-orange-600/10 blur-[120px]" />
          <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="space-y-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface-elevated/90 px-4 py-2 text-sm font-bold text-muted-body shadow-sm backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-accent-strong" aria-hidden /> {isArabic ? "برنامج الشركاء" : "Partner Program"}
              </span>
              <h1 className="text-balance text-4xl font-black leading-[1.08] tracking-tight text-foreground md:text-6xl">
                {isArabic ? "نمِّ أعمالك مع BabaBuilds ERP كشريك موزع" : "Grow your business as a BabaBuilds ERP reseller"}
              </h1>
              <p className="max-w-2xl text-lg font-medium leading-relaxed text-muted-body md:text-xl">
                {isArabic ? "ابنِ قناة اكتساب مستقرة عبر مساعدة العملاء على تحديث الفوترة والامتثال والعمليات. قدم خصومات للعملاء، وأغلق الصفقات أسرع، وحقق عمولات متكررة." : "Build a steady acquisition channel by helping clients modernize billing, compliance, and operations. Offer customer discounts, close deals faster, and earn recurring commissions."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="h-12 gap-2 rounded-2xl px-7 font-black">
                  <Link href="/signup?plan=pro&cycle=monthly&trial=15&source=reseller_hero">
                    {isArabic ? "قدّم كشريك موزع" : "Apply as a Reseller"} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-2xl px-7 font-bold">
                  <Link href="/referrals">{isArabic ? "الانتقال إلى لوحة الشركاء" : "Go to Partner Dashboard"}</Link>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { title: "عرض العميل الافتراضي", value: "خصم 25% في السنة الأولى" },
                  { title: "نطاق العمولة", value: "من 10% إلى 15% لكل صفقة مغلقة" },
                  { title: "شروط السداد", value: "صافي 30 يومًا مع دفتر تتبع" },
                ].map((metric) => (
                  <div
                    key={metric.title}
                    className="rounded-2xl border border-border/80 bg-surface-elevated px-4 py-4 shadow-sm"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-body">{metric.title}</p>
                    <p className="mt-2 text-sm font-bold text-foreground">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <m.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.35 }}
            >
              <Card className="rounded-3xl border-border/70 bg-surface-elevated shadow-xl">
                <CardHeader className="space-y-3">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <BadgeDollarSign className="h-6 w-6 text-orange-500" /> {isArabic ? "تسعير الشركاء المباشر" : "Partner Pricing Preview"}
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {isArabic ? "طبّق كود الشريك، عاين أثر الخصم فورًا، ثم أكمل الدفع بنفس سياق التسعير." : "Apply a reseller code, preview the discount instantly, then continue to checkout with the same pricing context."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {planIntervals.map((item) => (
                      <Button
                        key={item.interval}
                        type="button"
                        variant={selectedInterval === item.interval ? "default" : "outline"}
                        className="justify-start rounded-xl"
                        onClick={() => setSelectedInterval(item.interval)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-body">
                      {isArabic ? "منطقة التسعير" : "Pricing region"}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-5">
                    {(["IN", "US", "EU", "OM", "ROW"] as PricingRegion[]).map((region) => (
                      <Button
                        key={region}
                        type="button"
                        size="sm"
                        variant={pricingRegion === region ? "default" : "outline"}
                        className="rounded-lg text-xs font-bold"
                        onClick={() => setPricingRegion(region)}
                      >
                        {region}
                      </Button>
                    ))}
                  </div>
                  </div>

                  <form onSubmit={onApplyCoupon} className="space-y-2">
                    <Label htmlFor="resellerCoupon">{isArabic ? "كود كوبون الشريك" : "Reseller coupon code"}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="resellerCoupon"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder={isArabic ? "مثال: PARTNER-ABC123" : "Example: PARTNER-ABC123"}
                        className="font-mono"
                      />
                      <Button type="submit" disabled={applyingCoupon}>
                        {applyingCoupon ? (isArabic ? "جارٍ التطبيق..." : "Applying...") : (isArabic ? "تطبيق" : "Apply")}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-body">
                      {isArabic ? "استخدم كود شريك منشأ من لوحة الإدارة. سيُحفظ الكود حتى صفحة الدفع." : "Use a reseller code generated from the admin panel. It will persist through checkout."}
                    </p>
                  </form>

                  <div className="rounded-2xl border border-border/80 bg-surface-base p-4">
                    {coupon ? (
                      <>
                        <p className="text-sm font-bold text-foreground">
                          الكوبون <span className="font-mono">{coupon.code}</span> من {coupon.resellerName}
                        </p>
                        <p className="mt-1 text-xs text-muted-body">
                          خصم عميل {coupon.discountPercent}% · عمولة شريك {coupon.commissionPercent}%
                        </p>
                        <div className="mt-3 flex items-end gap-3">
                          <p className="text-sm text-muted-body line-through">
                            {formatMajorInCurrency(selectedPlan.amountMajor, selectedPlan.currency)}
                          </p>
                          <p className="text-3xl font-black text-foreground">
                            {formatMajorInCurrency(discountedAmount, selectedPlan.currency)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          أنت توفر{" "}
                          {formatMajorInCurrency(selectedPlan.amountMajor - discountedAmount, selectedPlan.currency)}
                        </p>
                        <Button type="button" variant="ghost" onClick={clearCoupon} className="mt-2 px-0 text-xs">
                          إزالة الكوبون
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-body">
                          السعر الأساسي الحالي
                        </p>
                        <p className="mt-2 text-3xl font-black text-foreground">
                          {formatMajorInCurrency(selectedPlan.amountMajor, selectedPlan.currency)}
                        </p>
                      </>
                    )}
                  </div>

                  <Button asChild className="h-12 w-full rounded-2xl font-black">
                    <Link href={checkoutHref}>{isArabic ? "المتابعة إلى دفع آمن" : "Continue to secure checkout"}</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 w-full rounded-2xl font-bold">
                    <Link href="/reseller/partner-kit">{isArabic ? "تحميل حقيبة الشريك" : "Download Partner Kit"}</Link>
                  </Button>
                </CardContent>
              </Card>
            </m.div>
          </div>
        </section>

        <section className="border-y border-border py-16">
          <div className="mx-auto grid max-w-7xl gap-4 px-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-5 w-5 text-orange-600" /> من يمكنه أن يصبح شريكًا موزعًا
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-body">
                {partnerTypes.map((item) => (
                  <p key={item} className="leading-relaxed">• {item}</p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <LifeBuoy className="h-5 w-5 text-emerald-600" /> دعم تمكين الشركاء
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-body">
                {supportItems.map((item) => (
                  <p key={item.href} className="leading-relaxed">
                    •{" "}
                    <Link
                      href={item.href}
                      className="font-semibold text-foreground underline-offset-4 hover:text-orange-600 hover:underline"
                      target={item.href.endsWith(".pdf") ? "_blank" : undefined}
                      rel={item.href.endsWith(".pdf") ? "noopener noreferrer" : undefined}
                    >
                      {item.label}
                    </Link>
                  </p>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="bg-surface-base py-14">
          <div className="mx-auto max-w-7xl px-6">
            <Card className="overflow-hidden border-border/80 bg-gradient-to-br from-surface-elevated to-surface-base">
              <CardContent className="grid gap-8 p-6 md:grid-cols-[1.1fr_0.9fr] md:items-center md:p-8">
                <div className="space-y-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-body">
                    الشريك الإقليمي الرسمي
                  </p>
                  <h2 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">
                    Aiwa Media Group هو شريكنا الرسمي للتوزيع في عُمان ودعم دول الخليج
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-body md:text-base">
                    للشركات في عُمان ودول الخليج، يوفر Aiwa Media Group دعم تهيئة محلي، واستشارات حلول،
                    ومساندة تنفيذ يقودها الشريك لنظام BabaBuilds ERP.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-border/80 bg-surface-elevated px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/90">
                      تغطية مخصصة لعُمان
                    </span>
                    <span className="rounded-full border border-border/80 bg-surface-elevated px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/90">
                      دعم شركاء الخليج
                    </span>
                  </div>
                  <Button asChild className="h-11 rounded-xl px-6 font-black">
                    <Link href="https://aiwamediagroup.com/" target="_blank" rel="noopener noreferrer">
                      زيارة Aiwa Media Group <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm dark:bg-zinc-950">
                  <Image
                    src="/aiwa-media-group-logo.png"
                    alt="شعار Aiwa Media Group"
                    width={980}
                    height={390}
                    className="h-auto w-full rounded-lg object-contain"
                    priority={false}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="bg-surface-base py-16">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-body">نموذج شركاء آمن</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">
                أخبرنا عن خطة عملك كشريك
              </h2>
              <p className="mt-3 text-sm text-muted-body">
                هذا النموذج محمي بفحوصات مكافحة الروبوتات وحدود الطلبات. شارك أهدافك وسيتواصل فريق الشركاء
                معك لدعم التفعيل وخطة الإطلاق.
              </p>
            </div>

            <Card className="rounded-3xl border-border/80 bg-surface-elevated">
              <CardContent className="p-6 md:p-8">
                <form onSubmit={onSubmitQuery} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">الاسم الكامل</Label>
                    <Input
                      id="fullName"
                      value={queryForm.fullName}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, fullName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد المهني</Label>
                    <Input
                      id="email"
                      type="email"
                      value={queryForm.email}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">الشركة</Label>
                    <Input
                      id="company"
                      value={queryForm.company}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, company: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <Input
                      id="phone"
                      value={queryForm.phone}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">الموقع الإلكتروني</Label>
                    <Input
                      id="website"
                      value={queryForm.website}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, website: e.target.value }))}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthlyClientLeads">عدد العملاء المتوقع شهريًا</Label>
                    <Input
                      id="monthlyClientLeads"
                      type="number"
                      min={0}
                      value={queryForm.monthlyClientLeads}
                      onChange={(e) =>
                        setQueryForm((prev) => ({ ...prev, monthlyClientLeads: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budgetBand">النطاق الميزاني</Label>
                    <Input
                      id="budgetBand"
                      value={queryForm.budgetBand}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, budgetBand: e.target.value }))}
                      placeholder="مثال: 1000$-5000$ لكل ربع"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="message">كيف تخطط لتقديم BabaBuilds ERP؟</Label>
                    <Textarea
                      id="message"
                      value={queryForm.message}
                      onChange={(e) => setQueryForm((prev) => ({ ...prev, message: e.target.value }))}
                      rows={5}
                      required
                    />
                  </div>
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    value={queryForm.honeypot}
                    onChange={(e) => setQueryForm((prev) => ({ ...prev, honeypot: e.target.value }))}
                    aria-hidden
                  />
                  <div className="md:col-span-2">
                    <TurnstileWidget onVerify={setQueryTurnstileToken} />
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-body">
                      محمي عبر Turnstile وحدود الخادم والتحقق من حقول المصيدة.
                    </p>
                    <Button type="submit" disabled={submittingQuery} className="rounded-2xl px-8 font-black">
                      {submittingQuery ? "جارٍ الإرسال..." : "إرسال الطلب"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-body">كيف يعمل النظام</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground md:text-3xl">
                مبني لنمو الشركاء بوضوح كامل
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Route className="h-4 w-4 text-indigo-500" /> كيف يتم تتبع العملاء المحتملين
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-body">
                  تربط أكواد الكوبون الفريدة كل مساحة عمل مُحالة بملف الشريك. وهذا يدعم تحليلات الاستخدام
                  والإيرادات والتحويلات والتجديد.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Handshake className="h-4 w-4 text-orange-500" /> تنفيذ مشترك أقوى للإطلاق السوقي
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-body">
                  تعاون في العروض وتسلسل الإطلاق وتأهيل العملاء مع الحفاظ على وضوح الملكية وشروط السداد.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" /> خصومات متوافقة مع الدفع
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-body">
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    معاينة تسعير الكوبون تظل متوافقة مع تحقق صفحة الدفع.
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    يتم حفظ الأكواد المطبقة لضمان استمرارية مسار الفوترة.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <FloatingPreferencesWidget />
      <LandingFooter />
    </div>
  );
}
