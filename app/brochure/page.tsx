import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Box, Download, ExternalLink, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

const SITE_URL = "https://erp.bababuilds.com";
const PDF_PATH = "/brochures/bababuilds-erp-command-after-dark.pdf";
const COVER_PATH = "/brochures/bababuilds-erp-command-after-dark-cover.png";
const WEB_EDITION_PATH = "/brochures/command-after-dark/index.html";
const canonicalUrl = `${SITE_URL}/brochure`;

export const metadata: Metadata = {
  title: "ERP Sales Brochure — Run the Whole Business Without the Chaos",
  description:
    "Explore the BabaBuilds ERP product brochure: proposals, invoicing, collections, cash flow, reconciliation, compliance, workforce, payroll, and more in one operating system.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: "website",
    url: canonicalUrl,
    title: "BabaBuilds ERP — Run the Whole Business Without the Chaos",
    description: "A visual, ten-page guide to the operating system for growing service businesses.",
    images: [{ url: COVER_PATH, width: 1120, height: 1584, alt: "BabaBuilds ERP sales brochure cover" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BabaBuilds ERP Sales Brochure",
    description: "See how proposals, revenue, cash, compliance, and operations connect in one workspace.",
    images: [COVER_PATH],
  },
};

export default function BrochurePage() {
  const creativeWorkLd = {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: "BabaBuilds ERP — Command After Dark sales brochure",
    description: "A ten-page visual product guide for growing service businesses.",
    url: canonicalUrl,
    encodingFormat: "application/pdf",
    contentUrl: `${SITE_URL}${PDF_PATH}`,
    publisher: { "@type": "Organization", name: "BabaBuilds", url: SITE_URL },
  };

  return (
    <main className="min-h-dvh bg-[#090a0b] text-zinc-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(creativeWorkLd) }} />

      <nav className="border-b border-white/10 bg-[#090a0b]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="BabaBuilds ERP home">
            <span className="grid size-10 place-items-center rounded-xl bg-[#f45b00] shadow-[0_0_28px_rgba(244,91,0,0.28)]">
              <Box className="size-5 text-white" aria-hidden />
            </span>
            <span className="text-lg font-black tracking-tight sm:text-xl">BabaBuilds ERP</span>
          </Link>
          <Button asChild variant="outline" className="hidden border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white sm:inline-flex">
            <Link href="/#demo-launcher">Explore the demo <ArrowRight className="size-4" aria-hidden /></Link>
          </Button>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[url('/brochures/command-after-dark/assets/control-convergence.png')] bg-cover bg-left opacity-30" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_0.62fr] lg:items-end lg:px-10 lg:py-24">
          <div>
            <p className="mb-5 text-xs font-black uppercase tracking-[0.2em] text-[#ff6a00]">Free 10-page product guide</p>
            <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Run the whole business. <span className="text-[#ff6200]">Without the chaos.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              See how BabaBuilds connects proposals, revenue, collections, cash, compliance, inventory, and people in one calm operating workspace.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-xl bg-[#f45b00] px-6 font-bold text-white shadow-[0_12px_38px_rgba(244,91,0,0.25)] hover:bg-[#dc5200]">
                <a href={PDF_PATH} download>
                  <Download className="size-4" aria-hidden /> Download the PDF
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/15 bg-white/5 px-6 font-bold text-zinc-100 hover:bg-white/10 hover:text-white">
                <Link href="/#demo-launcher">Explore the live demo <ArrowRight className="size-4" aria-hidden /></Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-sm lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div><strong className="block text-2xl text-white">10</strong><span className="text-zinc-500">A4 pages</span></div>
            <div><strong className="block text-2xl text-white">7</strong><span className="text-zinc-500">business flows</span></div>
            <div><strong className="block text-2xl text-white">Real</strong><span className="text-zinc-500">app screens</span></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6a00]">Read it here</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">The complete product story</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Scroll through the embedded brochure, open it full screen, or download a copy for your team.</p>
          </div>
          <Button asChild variant="outline" className="w-fit border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white">
            <a href={WEB_EDITION_PATH} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden /> Open web edition
            </a>
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121315] shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-zinc-500 sm:px-5">
            <span className="inline-flex items-center gap-2"><FileText className="size-4 text-[#ff6a00]" aria-hidden /> BabaBuilds ERP product brochure</span>
            <span>Web edition · 10 pages</span>
          </div>
          <iframe
            src={WEB_EDITION_PATH}
            title="BabaBuilds ERP sales brochure"
            className="hidden h-[82vh] min-h-[760px] w-full bg-zinc-900 md:block"
          />
          <div className="relative md:hidden">
            <Image
              src={COVER_PATH}
              alt="BabaBuilds ERP brochure cover"
              width={1120}
              height={1584}
              className="h-auto w-full"
              priority
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/85 p-5 backdrop-blur-sm">
              <Button asChild className="w-full rounded-xl bg-[#f45b00] font-bold text-white hover:bg-[#dc5200]">
                <a href={PDF_PATH} target="_blank" rel="noreferrer">Open the complete brochure <ExternalLink className="size-4" aria-hidden /></a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#111214]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-3 lg:px-10 lg:py-16">
          {[
            ["01", "Make the cost of disconnected tools visible", "See where manual handoffs create chasing, delay, and hidden risk."],
            ["02", "Follow the revenue-to-cash journey", "Move from proposal and invoice to collection, reconciliation, and cleaner books."],
            ["03", "Plan a practical rollout", "Start with the workflows that matter now and add modules as the operation matures."],
          ].map(([number, title, copy]) => (
            <article key={number} className="border-t border-[#6b351c] pt-5">
              <span className="text-xs font-black text-[#ff6a00]">{number}</span>
              <h3 className="mt-3 text-lg font-bold leading-6">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6a00]">Ready to see it with real workflows?</p>
        <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">Bring the business into one clear view.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400">Explore a seeded workspace, follow the full operating cycle, and decide where BabaBuilds can remove the most friction for your team.</p>
        <Button asChild size="lg" className="mt-8 h-12 rounded-xl bg-[#f45b00] px-7 font-bold text-white hover:bg-[#dc5200]">
          <Link href="/#demo-launcher">Start the interactive demo <ArrowRight className="size-4" aria-hidden /></Link>
        </Button>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} BabaBuilds ERP · Product capabilities and integrations vary by configuration, region, and plan.
      </footer>
    </main>
  );
}
