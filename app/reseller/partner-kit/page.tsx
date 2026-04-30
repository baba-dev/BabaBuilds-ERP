import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, FileText, MessageSquareText, PlayCircle, Presentation, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";
import { RoiCalculator } from "@/components/reseller/RoiCalculator";

export const metadata: Metadata = {
  title: "حزمة شريك الموزعين | BabaBuilds ERP",
  description:
    "نزّل حزمة شريك الموزعين الرسمية: عرض المبيعات، ورقة الأسعار، نص واتساب، ورقة معالجة الاعتراضات، قائمة التفعيل، وحاسبة العائد.",
  alternates: {
    canonical: "https://erp.bababuilds.com/reseller/partner-kit",
  },
};

const kitAssets = [
  {
    title: "عرض الشريك",
    description: "سرد عرض البيع، والعميل المثالي، ومسار التحويل لعروض يقودها الشريك.",
    href: "/api/reseller/partner-kit/sales-deck",
    icon: Presentation,
  },
  {
    title: "ورقة أسعار من صفحة واحدة",
    description: "ملخص أسعار موجه للعميل مع توضيح خصم الموزع.",
    href: "/api/reseller/partner-kit/pricing-sheet",
    icon: FileText,
  },
  {
    title: "نص واتساب",
    description: "قوالب رسائل للتواصل الأولي، والمتابعة، وحجز العرض.",
    href: "/api/reseller/partner-kit/whatsapp-script",
    icon: MessageSquareText,
  },
  {
    title: "ورقة معالجة الاعتراضات",
    description: "ردود سريعة على الاعتراضات التجارية والمنتج الشائعة.",
    href: "/api/reseller/partner-kit/objection-sheet",
    icon: ShieldCheck,
  },
  {
    title: "قائمة تفعيل الشريك",
    description: "خطوات تفعيل الشريك وإطلاق أول عميل بشكل منظم.",
    href: "/api/reseller/partner-kit/onboarding-checklist",
    icon: FileText,
  },
];

export default function ResellerPartnerKitPage() {
  return (
    <div className="min-h-screen bg-surface-base text-foreground">
      <LandingNavbar />
      <main className="pt-28">
        <section className="mx-auto max-w-7xl px-6 pb-14">
          <div className="rounded-3xl border border-border/80 bg-surface-elevated p-7 shadow-sm md:p-10">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-body">تمكين الشركاء</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">حزمة شريك الموزعين</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-body md:text-base">
              نزّل مواد الشريك الجاهزة واستخدم حاسبة العائد قبل عرض الخدمة. كل ملف مُحسّن لمحادثات أسرع مع العملاء ونسب إغلاق أفضل.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-14">
          <div className="grid gap-4 md:grid-cols-2">
            {kitAssets.map((asset) => {
              const Icon = asset.icon;
              return (
                <Card key={asset.title} className="rounded-2xl border-border/80 bg-surface-elevated">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Icon className="h-5 w-5 text-orange-600" />
                      {asset.title}
                    </CardTitle>
                    <CardDescription>{asset.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild className="h-10 rounded-xl font-bold">
                      <Link href={asset.href}>
                        تنزيل
                        <ArrowDownToLine className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-14">
          <RoiCalculator />
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20">
          <Card className="rounded-2xl border-border/80 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PlayCircle className="h-5 w-5" />
                جولة عرض توضيحي
              </CardTitle>
              <CardDescription className="text-zinc-200 dark:text-zinc-700">
                شارك هذا العرض النموذجي عندما يطلب الشريك قصة المنتج بشكل عملي.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="h-10 rounded-xl font-bold">
                <Link href="/reseller">افتح صفحة عرض الموزعين</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
