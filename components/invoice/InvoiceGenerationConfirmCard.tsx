"use client";

import { CheckCircle2, Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type ConfirmService = {
  title: string;
  amount: number;
  quantity: number;
};

type ConfirmTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
};

type ConfirmData = {
  clientName: string;
  clientEmail: string | null;
  billingMonth: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  services: ConfirmService[];
  totals: ConfirmTotals;
  paymentLink: { url: string; linkId: string };
};

type Props = {
  confirmation: ConfirmData;
  expiresAt: string;
  sendEmail: boolean;
  isConfirming: boolean;
  onBack: () => void;
  onConfirm: () => void;
  fCurrency: (amount: number) => string;
};

export function InvoiceGenerationConfirmCard({
  confirmation,
  expiresAt,
  sendEmail,
  isConfirming,
  onBack,
  onConfirm,
  fCurrency,
}: Props) {
  const copyUrl = async () => {
    if (!confirmation.paymentLink.url || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(confirmation.paymentLink.url);
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 w-full" />
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">
          Confirm Razorpay Invoice
        </CardTitle>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
          Review invoice details and the generated payment URL before final creation.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/70 dark:bg-zinc-950/50">
            <p className="text-[11px] uppercase tracking-widest font-bold text-zinc-500">Client</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{confirmation.clientName}</p>
            <p className="text-xs text-zinc-500">{confirmation.clientEmail ?? "No email"}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/70 dark:bg-zinc-950/50">
            <p className="text-[11px] uppercase tracking-widest font-bold text-zinc-500">Billing cycle</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{confirmation.billingMonth}</p>
            <p className="text-xs text-zinc-500">
              Invoice {new Date(confirmation.invoiceDate).toLocaleDateString()} · Due {new Date(confirmation.dueDate).toLocaleDateString()}
            </p>
            <p className="text-xs text-zinc-500">Preview expires {new Date(expiresAt).toLocaleTimeString()}</p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-xs uppercase font-bold tracking-widest text-zinc-500">
            Service summary
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {confirmation.services.map((service, index) => (
              <div key={`${service.title}-${index}`} className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {service.title} <span className="text-zinc-500">x{service.quantity}</span>
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {fCurrency(service.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 text-xs uppercase tracking-widest font-bold">
            <Link2 className="w-4 h-4" />
            Razorpay URL (real link)
          </div>
          <p className="break-all text-sm font-semibold text-indigo-900 dark:text-indigo-200">{confirmation.paymentLink.url}</p>
          <div className="text-xs text-indigo-600/80 dark:text-indigo-300/80">Link ID: {confirmation.paymentLink.linkId}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={copyUrl}>
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy URL
            </Button>
            <Button type="button" variant="outline" size="sm" asChild className="text-xs">
              <a href={confirmation.paymentLink.url} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Link
              </a>
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/70 dark:bg-zinc-950/40">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fCurrency(confirmation.totals.subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span>Tax ({confirmation.totals.taxRate.toFixed(2)}%)</span><span>{fCurrency(confirmation.totals.taxAmount)}</span></div>
          <div className="flex justify-between text-base font-black mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <span>Total</span><span>{fCurrency(confirmation.totals.total)}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onBack} disabled={isConfirming}>
          Back to Edit
        </Button>
        <Button type="button" className="w-full sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={onConfirm} disabled={isConfirming}>
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {isConfirming
            ? sendEmail
              ? "Generating & Sending Invoice..."
              : "Generating Invoice..."
            : "Confirm & Generate Invoice"}
        </Button>
      </CardFooter>
    </Card>
  );
}
