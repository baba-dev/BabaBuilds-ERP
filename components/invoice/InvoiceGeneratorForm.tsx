"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, Mail, Briefcase, Loader2, Building2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { TaxRateModal } from "@/components/invoice/tax-rate-modal";
import { DatePickerField } from "@/components/forms/date-picker-field";
import { SearchableCombobox } from "@/components/forms/searchable-combobox";
import { FormFieldMessages, FormSection, FormSubmitBar } from "@/components/forms/form-primitives";

// MISSION CRITICAL: Globalization & Caching Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { getBustedUrl } from "@/lib/cache-buster";
import { getConflictPolicy, queueOfflineMutation } from "@/lib/offline-sync";
import { cn } from "@/lib/utils";
import { dirFromLocale } from "@/src/lib/direction";
import { buildInvoiceGenerateErrorMessage } from "@/lib/invoice/generate-error-message";
import { InvoiceGenerationConfirmCard } from "@/components/invoice/InvoiceGenerationConfirmCard";

const isLikelyOfflineError = (error: unknown) => {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
};


type InvoiceCompanyConfirmation = {
  companyName?: string | null;
  proprietorName?: string | null;
  taxIdLabel?: string | null;
  panNumber?: string | null;
  gstin?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  defaultGateway?: string | null;
  razorpayKeyId?: string | null;
  stripePublishableKey?: string | null;
  primaryBankAccount?: {
    bankName?: string | null;
    accountName?: string | null;
    maskedAccountNumber?: string | null;
    accountNumberMasked?: string | null;
    ifscCode?: string | null;
  } | null;
};

type RecentCompanySwitch = { name?: string; switchedAt?: number };

interface InvoiceGeneratorFormProps {
  /** Called with the generated invoice data after a successful submission. Pass to close the modal. */
  onSuccess?: (data: {
    pdfPath: string;
    invoiceNumber: string;
    emailStatus?: string;
    paymentLinkStatus?: { attempted: boolean; created: boolean; skipReason: string | null };
  }) => void;
  /** When true, the form is rendered in a compact modal context (no outer Card chrome). */
  inModal?: boolean;
}

export default function InvoiceGeneratorForm({ onSuccess, inModal = false }: InvoiceGeneratorFormProps) {
  const t = useTranslations("Invoice");
  const [isGenerating, setIsGenerating] = useState(false);
  const [successData, setSuccessData] = useState<{
    pdfPath: string;
    invoiceNumber: string;
    emailStatus?: string;
    paymentLinkStatus?: { attempted: boolean; created: boolean; skipReason: string | null };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<{
    draftId: string;
    expiresAt: string;
    confirmation: {
      clientName: string;
      clientEmail: string | null;
      billingMonth: string;
      invoiceDate: string;
      dueDate: string;
      currency: string;
      services: Array<{ title: string; amount: number; quantity: number }>;
      totals: { subtotal: number; taxAmount: number; total: number; taxRate: number; taxMode: string };
      paymentLink: { url: string; linkId: string };
    };
    sendEmail: boolean;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // --- GLOBALIZATION ENGINE ---
  const {
    fCurrency,
    currency,
    locale,
    dateFormat = "dd/MM/yyyy",
    taxLabel,
    countryCode = "Global",
  } = useFormat();

  const currencySymbol = getCurrencySymbol(currency, locale);
  const isRtl = dirFromLocale(locale) === "rtl";

  // App State
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [existingInvoices, setExistingInvoices] = useState<Array<{ billingMonth: string; clientId: string | null }>>([]);
  const [billingMonth, setBillingMonth] = useState(() => format(new Date(), "MMMM yyyy"));
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [isMounted, setIsMounted] = useState(false);

  // Email State
  const [sendEmail, setSendEmail] = useState(false);
  const [taxRateModalOpen, setTaxRateModalOpen] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState("");
  const [taxRateMeta, setTaxRateMeta] = useState<{ taxLabel?: string; countryCode?: string; candidates?: number[] }>({});

  // Dynamic Services State
  const [services, setServices] = useState<any[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [companyConfirmation, setCompanyConfirmation] = useState<InvoiceCompanyConfirmation | null>(null);
  const [companyConfirmed, setCompanyConfirmed] = useState(false);
  const [recentCompanySwitch, setRecentCompanySwitch] = useState<RecentCompanySwitch | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setBillingMonth((current) => current || format(new Date(), "MMMM yyyy"));

    setIsLoadingServices(true);
    Promise.all([
      fetch("/api/clients?limit=100").then((res) => res.json()).catch(() => ({ data: [] })),
      fetch("/api/invoices/billing-months?limit=1000").then((res) => res.json()).catch(() => ({ data: [] })),
      fetch("/api/services?limit=100").then((res) => res.json()).catch(() => ({ data: [] })),
      fetch("/api/inventory/products?limit=100").then((res) => res.json()).catch(() => []),
      fetch("/api/settings", { cache: "no-store" }).then((res) => res.json()).catch(() => null),
    ]).then(([clientsResult, invoicesResult, servicesResult, productsResult, settingsResult]) => {
      if (settingsResult && !settingsResult.error) setCompanyConfirmation(settingsResult as InvoiceCompanyConfirmation);
      try {
        const rawSwitch = sessionStorage.getItem("bababuilds:last-company-switch");
        const parsedSwitch = rawSwitch ? JSON.parse(rawSwitch) as RecentCompanySwitch : null;
        if (parsedSwitch?.switchedAt && Date.now() - parsedSwitch.switchedAt < 10 * 60 * 1000) {
          setRecentCompanySwitch(parsedSwitch);
        } else {
          setRecentCompanySwitch(null);
        }
      } catch {
        setRecentCompanySwitch(null);
      }
      const parsedClients = Array.isArray(clientsResult) ? clientsResult : clientsResult?.data;
      if (Array.isArray(parsedClients)) setClients(parsedClients);

      const parsedBillingMonths = Array.isArray(invoicesResult)
        ? invoicesResult
        : (invoicesResult as any)?.data;
      if (Array.isArray(parsedBillingMonths)) {
        setExistingInvoices(
          parsedBillingMonths.map((row: any) => ({
            billingMonth: String(row?.billingMonth || ""),
            clientId: row?.clientId ? String(row.clientId) : null,
          })),
        );
      }

      const parsedServices = Array.isArray(servicesResult) ? servicesResult : servicesResult?.data;
      const mappedCatalog: any[] = [];
      if (Array.isArray(parsedServices)) {
        parsedServices.forEach((srv: any) => {
          mappedCatalog.push({
            id: srv.id,
            selected: false,
            title: srv.name,
            nicDetails: srv.description || "Standard Service Rendered",
            sac: srv.sacCode || (countryCode === "IN" ? "998313" : "GENERIC"),
            amount: "",
            quantity: 1,
            unitPrice: srv.defaultPrice || 0,
            defaultPrice: srv.defaultPrice || 0,
            isProduct: false,
            productId: null,
            currentStock: 0,
          });
        });
      }

      const parsedProducts = Array.isArray(productsResult) ? productsResult : [];
      if (Array.isArray(parsedProducts)) {
        parsedProducts.forEach((p: any) => {
          mappedCatalog.push({
            id: p.id,
            selected: false,
            title: p.name,
            nicDetails: `SKU: ${p.sku}`,
            sac: p.category || "GOODS",
            amount: "",
            quantity: 1,
            unitPrice: p.baselinePrice || p.costPrice || 0,
            defaultPrice: p.baselinePrice || p.costPrice || 0,
            isProduct: true,
            productId: p.id,
            currentStock: p.currentStock,
          });
        });
      }

      setServices(mappedCatalog);
    }).finally(() => {
      setIsLoadingServices(false);
    });
  }, [successData, countryCode]); // Re-fetches when invoice succeeds OR country changes

  // --- SMART AI AUTO-FILL ---
  useEffect(() => {
    if (clients.length === 0 || services.length === 0) return;

    const aiPayload = sessionStorage.getItem("erp_ai_payload");
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = Date.now() - timestamp < 10000;

        const isInvoicePath = path === "/income" || path === "/invoice" || path === "/";
        if (isFresh && data && isInvoicePath) {
          if (data.client) {
            const matchedClient = clients.find((c) => c.name.toLowerCase().includes(data.client.toLowerCase()));
            if (matchedClient) setSelectedClientId(matchedClient.id.toString());
          }
          if (data.amount) {
            const newServices = [...services];
            newServices[0].selected = true;
            newServices[0].amount = data.amount.toString();
            setServices(newServices);
          }
        }
        sessionStorage.removeItem("erp_ai_payload");
      } catch {
        console.error("Failed to parse AI payload");
      }
    }
  }, [clients, services]);

  // --- COMPONENT LOGIC ---
  const selectedClient = useMemo(() => clients.find((c) => c.id.toString() === selectedClientId), [clients, selectedClientId]);
  const companyTaxId = companyConfirmation?.gstin || companyConfirmation?.panNumber || "Not configured";
  const bankIdentity = companyConfirmation?.primaryBankAccount
    ? [companyConfirmation.primaryBankAccount.bankName, companyConfirmation.primaryBankAccount.accountName, companyConfirmation.primaryBankAccount.maskedAccountNumber || companyConfirmation.primaryBankAccount.accountNumberMasked, companyConfirmation.primaryBankAccount.ifscCode].filter(Boolean).join(" · ")
    : [companyConfirmation?.bankName, companyConfirmation?.accountName].filter(Boolean).join(" · ") || "Not configured";
  const paymentIdentity = [companyConfirmation?.defaultGateway || "Offline bank transfer", companyConfirmation?.razorpayKeyId || companyConfirmation?.stripePublishableKey].filter(Boolean).join(" · ");
  const activeServices = services.filter((s) => s.selected);
  const totalAmount = activeServices.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const smartSacCode = useMemo(() => {
    const sacs = activeServices.map((s) => {
      if (typeof s.sac === "string" || typeof s.sac === "number") return String(s.sac);
      if (typeof s.sac === "object" && s.sac !== null) {
        return s.sac.code || s.sac.value || s.sac.label || "Invalid Format";
      }
      return "Unknown";
    });

    if (sacs.length === 0) return "None selected";
    return Array.from(new Set(sacs)).join(" / ");
  }, [activeServices]);

  const isMonthAlreadyBilled = useMemo(() => {
    if (!selectedClientId || !billingMonth) return false;
    return existingInvoices.some((inv) => inv.clientId === selectedClientId && inv.billingMonth === billingMonth);
  }, [existingInvoices, selectedClientId, billingMonth]);

  const monthOptions = useMemo(() => {
    if (!isMounted) return [];
    return Array.from({ length: 12 }).map((_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 6 + i);
      return format(d, "MMMM yyyy");
    });
  }, [isMounted]);

  useEffect(() => {
    setCompanyConfirmed(false);
  }, [companyConfirmation?.companyName, companyConfirmation?.gstin, companyConfirmation?.panNumber, bankIdentity, paymentIdentity]);

  const handleServiceToggle = (index: number) => {
    const newServices = [...services];
    newServices[index].selected = !newServices[index].selected;

    if (newServices[index].selected) {
      newServices[index].quantity = 1;
      newServices[index].amount = newServices[index].defaultPrice > 0 ? newServices[index].defaultPrice.toString() : "";
    } else {
      newServices[index].amount = "";
    }
    setServices(newServices);
  };

  const handleAmountChange = (index: number, value: string) => {
    const newServices = [...services];
    newServices[index].amount = value;
    newServices[index].unitPrice = Number(value) / Number(newServices[index].quantity || 1);
    setServices(newServices);
  };

  const handleQuantityChange = (index: number, qty: string) => {
    const newServices = [...services];
    const newQty = parseInt(qty) || 0;

    if (newServices[index].isProduct && newQty > newServices[index].currentStock) {
      setError(`Cannot add ${newQty} of ${newServices[index].title}. Only ${newServices[index].currentStock} in stock.`);
      return;
    }
    setError(null);
    newServices[index].quantity = newQty;
    newServices[index].amount = (newQty * Number(newServices[index].unitPrice || newServices[index].defaultPrice)).toString();
    setServices(newServices);
  };

  useEffect(() => {
    // 5.1 FIX: auto-enable email delivery when a client with an email is selected;
    // auto-disable when the client has no email on file.
    if (selectedClient && !selectedClient.email) {
      setSendEmail(false);
    } else if (selectedClient && selectedClient.email) {
      setSendEmail(true);
    }
  }, [selectedClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) { setError("No client selected. Please select a client from the CRM."); return; }
    if (!billingMonth.trim()) { setError("Billing month is required. Please select a cycle period."); return; }

    if (!companyConfirmed) { setError("Confirm the active company and payment identity before generating this invoice."); return; }

    setIsGenerating(true); setError(null); setSuccessData(null); setDraftPreview(null);

    const hasInvalidProductQty = activeServices.some(
      (s) => Boolean(s.isProduct) && (!Number.isFinite(Number(s.quantity)) || Number(s.quantity) < 1),
    );
    if (hasInvalidProductQty) {
      setError("Product quantity must be at least 1.");
      setIsGenerating(false);
      return;
    }

    const validServices = activeServices.filter((s) => Number(s.amount) > 0);
    if (validServices.length === 0) {
      setError("Please enter an amount for the selected services.");
      setIsGenerating(false); return;
    }

    try {
      const response = await fetch("/api/generate/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "create"),
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          billingMonth,
          sacCode: smartSacCode,
          services: validServices,
          customDate: invoiceDate.toISOString(),
          sendEmail,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 422 && data?.code === "TAX_RATE_REQUIRED") {
          setTaxRateMeta({
            taxLabel: data.taxLabel,
            countryCode: data.countryCode,
            candidates: data.candidates || [],
          });
          setTaxRateModalOpen(true);
          return;
        }
        if (
          [400, 502].includes(response.status) &&
          ["RAZORPAY_PREVIEW_NOT_APPLICABLE", "UNSUPPORTED_CURRENCY", "MISSING_GATEWAY_CREDENTIALS", "GATEWAY_CALL_FAILED"].includes(
            data?.code,
          )
        ) {
          const fallbackResponse = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "create"),
            },
            body: JSON.stringify({
              clientId: selectedClientId,
              billingMonth,
              sacCode: smartSacCode,
              services: validServices,
              customDate: invoiceDate.toISOString(),
              sendEmail,
            }),
          });
          const fallbackData = await fallbackResponse.json().catch(() => null);
          if (!fallbackResponse.ok) {
            throw new Error(buildInvoiceGenerateErrorMessage(fallbackData, "Failed to generate invoice."));
          }
          const result = {
            pdfPath: fallbackData.invoice.pdfPath,
            invoiceNumber: fallbackData.invoice.invoiceNumber,
            emailStatus: fallbackData.emailStatus,
            paymentLinkStatus: fallbackData.paymentLinkStatus,
          };
          setSuccessData(result);
          setServices(services.map((s) => ({ ...s, selected: false, amount: "" })));
          onSuccess?.(result);
          return;
        }
        throw new Error(buildInvoiceGenerateErrorMessage(data, "Failed to generate invoice."));
      }

      if (!data.confirmation.paymentLink?.url) {
        // Skip the second step: immediately finalize the invoice!
        const finalizeResponse = await fetch("/api/generate/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "create"),
          },
          body: JSON.stringify({ draftId: data.draftId }),
        });
        const finalizeData = await finalizeResponse.json().catch(() => null);
        if (!finalizeResponse.ok) {
          throw new Error(buildInvoiceGenerateErrorMessage(finalizeData, "Failed to finalize invoice."));
        }
        const result = {
          pdfPath: finalizeData.invoice.pdfPath,
          invoiceNumber: finalizeData.invoice.invoiceNumber,
          emailStatus: finalizeData.emailStatus,
          paymentLinkStatus: finalizeData.paymentLinkStatus,
        };
        setSuccessData(result);
        setServices(services.map((s) => ({ ...s, selected: false, amount: "" })));
        onSuccess?.(result);
      } else {
        setDraftPreview({
          draftId: data.draftId,
          expiresAt: data.expiresAt,
          confirmation: data.confirmation,
          sendEmail,
        });
      }
    } catch (err: unknown) {
      if (isLikelyOfflineError(err)) {
        void queueOfflineMutation({
          entity: "invoice",
          operation: "create",
          endpoint: "/api/generate",
          method: "POST",
          payload: {
            clientId: selectedClientId,
            billingMonth,
            sacCode: smartSacCode,
            services: activeServices.filter((s) => Number(s.amount) > 0),
            customDate: invoiceDate.toISOString(),
            sendEmail,
          },
          conflictPolicy: getConflictPolicy("invoice", "create"),
          lastError: err instanceof Error ? err.message : "Offline request queued",
        });
        setError("You appear to be offline. Invoice request has been queued for retry.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to generate");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTaxRateConfirm = async () => {
    if (!taxRateInput) return;
    setIsGenerating(true);
    const validServices = activeServices.filter((s) => Number(s.amount) > 0);
    try {
      const response = await fetch("/api/generate/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "update"),
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          billingMonth,
          sacCode: smartSacCode,
          services: validServices,
          customDate: invoiceDate.toISOString(),
          sendEmail,
          taxRateOverride: Number(taxRateInput),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (
          [400, 502].includes(response.status) &&
          ["RAZORPAY_PREVIEW_NOT_APPLICABLE", "UNSUPPORTED_CURRENCY", "MISSING_GATEWAY_CREDENTIALS", "GATEWAY_CALL_FAILED"].includes(
            data?.code,
          )
        ) {
          const fallbackResponse = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "update"),
            },
            body: JSON.stringify({
              clientId: selectedClientId,
              billingMonth,
              sacCode: smartSacCode,
              services: validServices,
              customDate: invoiceDate.toISOString(),
              sendEmail,
              taxRateOverride: Number(taxRateInput),
            }),
          });
          const fallbackData = await fallbackResponse.json().catch(() => null);
          if (!fallbackResponse.ok) {
            throw new Error(buildInvoiceGenerateErrorMessage(fallbackData, "Failed to generate invoice."));
          }
          const result = {
            pdfPath: fallbackData.invoice.pdfPath,
            invoiceNumber: fallbackData.invoice.invoiceNumber,
            emailStatus: fallbackData.emailStatus,
            paymentLinkStatus: fallbackData.paymentLinkStatus,
          };
          setSuccessData(result);
          setServices(services.map((s) => ({ ...s, selected: false, amount: "" })));
          setTaxRateInput("");
          setTaxRateModalOpen(false);
          onSuccess?.(result);
          return;
        }
        throw new Error(buildInvoiceGenerateErrorMessage(data, "Failed to generate invoice."));
      }

      if (!data.confirmation.paymentLink?.url) {
        // Skip the second step: immediately finalize the invoice!
        const finalizeResponse = await fetch("/api/generate/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "create"),
          },
          body: JSON.stringify({ draftId: data.draftId }),
        });
        const finalizeData = await finalizeResponse.json().catch(() => null);
        if (!finalizeResponse.ok) {
          throw new Error(buildInvoiceGenerateErrorMessage(finalizeData, "Failed to finalize invoice."));
        }
        const result = {
          pdfPath: finalizeData.invoice.pdfPath,
          invoiceNumber: finalizeData.invoice.invoiceNumber,
          emailStatus: finalizeData.emailStatus,
          paymentLinkStatus: finalizeData.paymentLinkStatus,
        };
        setSuccessData(result);
        setServices(services.map((s) => ({ ...s, selected: false, amount: "" })));
        setTaxRateInput("");
        setTaxRateModalOpen(false);
        onSuccess?.(result);
      } else {
        setDraftPreview({
          draftId: data.draftId,
          expiresAt: data.expiresAt,
          confirmation: data.confirmation,
          sendEmail,
        });
        setTaxRateInput("");
        setTaxRateModalOpen(false);
        setError(null);
      }
    } catch (err: unknown) {
      if (isLikelyOfflineError(err)) {
        void queueOfflineMutation({
          entity: "invoice",
          operation: "update",
          endpoint: "/api/generate",
          method: "POST",
          payload: {
            clientId: selectedClientId,
            billingMonth,
            sacCode: smartSacCode,
            services: activeServices.filter((s) => Number(s.amount) > 0),
            customDate: invoiceDate.toISOString(),
            sendEmail,
            taxRateOverride: Number(taxRateInput),
          },
          conflictPolicy: getConflictPolicy("invoice", "update"),
          lastError: err instanceof Error ? err.message : "Offline request queued",
        });
        setError("You appear to be offline. Invoice override request has been queued for manual merge review.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to generate");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmGenerate = async () => {
    if (!draftPreview?.draftId) return;
    setIsConfirming(true);
    setError(null);
    try {
      const response = await fetch("/api/generate/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Offline-Conflict-Policy": getConflictPolicy("invoice", "create"),
        },
        body: JSON.stringify({ draftId: draftPreview.draftId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(buildInvoiceGenerateErrorMessage(data, "Failed to finalize invoice."));
      }
      const result = {
        pdfPath: data.invoice.pdfPath,
        invoiceNumber: data.invoice.invoiceNumber,
        emailStatus: data.emailStatus,
        paymentLinkStatus: data.paymentLinkStatus,
      };
      setSuccessData(result);
      setServices(services.map((s) => ({ ...s, selected: false, amount: "" })));
      setDraftPreview(null);
      onSuccess?.(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to finalize invoice.");
    } finally {
      setIsConfirming(false);
    }
  };

  

  const confirmStepContent = draftPreview ? (
    <form className="bg-white dark:bg-zinc-950 flex flex-col relative">
      <CardContent className="px-6 md:px-8 py-8">
        <InvoiceGenerationConfirmCard
          confirmation={draftPreview.confirmation}
          expiresAt={draftPreview.expiresAt}
          sendEmail={sendEmail}
          isConfirming={isConfirming}
          onBack={() => setDraftPreview(null)}
          onConfirm={handleConfirmGenerate}
          fCurrency={fCurrency}
        />

        <FormFieldMessages
          errorText={error ? <span className="flex items-center justify-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</span> : undefined}
          className="w-full mt-6 p-4 bg-red-50 dark:bg-red-500/10 border-s-4 border-red-500 rounded-e-xl text-xs text-center font-bold uppercase tracking-widest shadow-sm animate-pulse"
        />
      </CardContent>
    </form>
  ) : null;

  const formContent = (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-950 flex flex-col relative">
      <CardContent className="space-y-8 px-6 md:px-8 py-8">

        <FormSection className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="invoice-client" className="text-zinc-700 dark:text-zinc-300 font-bold uppercase text-xs tracking-widest">{t("billing_to")}</Label>
            <SearchableCombobox
              value={selectedClientId}
              onChange={(val) => { setSelectedClientId(val); setError(null); }}
              placeholder={t("select_crm")}
              searchPlaceholder={`${t("select_crm")}...`}
              emptyText={t("no_clients")}
              options={clients.map((c) => ({
                value: c.id.toString(),
                label: c.name,
                description: c.country,
                keywords: [c.country, c.email || ""],
              }))}
              className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 h-11 font-bold text-xs shadow-sm text-zinc-900 dark:text-zinc-100 focus:ring-indigo-500/30"
            />
            {selectedClient && (
              <div className="flex items-center gap-1.5 px-1 pt-1 text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="h-3 w-3" /> {t("jurisdiction", { country: selectedClient.country })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-date" className="text-zinc-700 dark:text-zinc-300 font-bold uppercase text-xs tracking-widest">{t("document_date")}</Label>
            <DatePickerField
              value={invoiceDate}
              onChange={setInvoiceDate}
              placeholder={t("pick_date")}
              formatString={dateFormat}
              buttonClassName="font-bold text-xs border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm focus-visible:ring-indigo-500/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-cycle" className="text-zinc-700 dark:text-zinc-300 font-bold uppercase text-xs tracking-widest">{t("cycle_period")}</Label>
            <Select value={billingMonth} onValueChange={setBillingMonth}>
              <SelectTrigger id="invoice-cycle" className={`w-full bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 h-11 font-bold text-xs text-zinc-900 dark:text-zinc-100 shadow-sm focus:ring-indigo-500/30 transition-all ${isMonthAlreadyBilled ? "ring-2 ring-amber-400 dark:ring-amber-500/50 border-amber-300 dark:border-amber-600" : ""}`}>
                <SelectValue placeholder={t("select_month")} />
              </SelectTrigger>
              <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                {isMounted && monthOptions.map((month) => <SelectItem key={month} value={month} className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">{month}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </FormSection>

        {isMonthAlreadyBilled && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border-s-4 border-amber-400 dark:border-amber-500 rounded-e-md text-amber-800 dark:text-amber-400 text-xs font-medium animate-in fade-in slide-in-from-top-2 shadow-sm">
            <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-500 shrink-0" />
            <p className="leading-relaxed">{t("warning_duplicate", { billingMonth })}</p>
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
            <Briefcase className="w-4 h-4 text-indigo-500" /> {t("services_rendered")}
          </h2>

          <div className="grid gap-3.5">
            {isLoadingServices ? (
              <div className="flex flex-col justify-center items-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/40">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500/50 mb-3" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest animate-pulse">{t("loading_catalog")}</span>
              </div>
            ) : services.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20 group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />
                </div>
                <p className="text-zinc-800 dark:text-zinc-200 font-bold uppercase tracking-widest text-sm mb-1.5">{t("catalog_empty")}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">{t("catalog_empty_desc")}</p>
              </div>
            ) : (
              services.map((service, index) => (
                <div key={service.id} className={`p-4 border rounded-xl transition-all duration-300 ${service.selected ? "border-indigo-500 dark:border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10 shadow-sm ring-1 ring-indigo-500/10 dark:ring-indigo-500/20 md:-translate-y-0.5" : "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 hover:bg-white dark:hover:bg-zinc-900/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm group"}`}>
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="pt-[5px]">
                        <Checkbox
                          id={`service-check-${index}`}
                          checked={service.selected}
                          onCheckedChange={() => handleServiceToggle(index)}
                          aria-label={`Select ${service.title}`}
                          disabled={service.isProduct && service.currentStock === 0}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`service-check-${index}`} className="text-sm font-bold text-zinc-900 dark:text-zinc-50 cursor-pointer flex items-center gap-2">
                          {service.title}
                          {service.isProduct && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold tracking-widest ${service.currentStock > 0 ? "bg-emerald-100/50 text-emerald-700" : "bg-red-100/50 text-red-700"}`}>
                              {service.currentStock} IN STOCK
                            </span>
                          )}
                        </Label>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono uppercase tracking-widest font-bold opacity-80">{service.nicDetails}</p>
                      </div>
                    </div>
                    {service.selected && (
                      <div className="flex items-center gap-2 w-full sm:w-auto animate-in fade-in zoom-in-95 duration-300 ease-out">
                        {service.isProduct && (
                          <div className="w-[80px]">
                            <Label htmlFor={`service-qty-${index}`} className="sr-only">Quantity</Label>
                            <Input
                              id={`service-qty-${index}`}
                              type="number"
                              min="1"
                              max={service.currentStock}
                              placeholder="Qty"
                              value={service.quantity}
                              onChange={(e) => handleQuantityChange(index, e.target.value)}
                              className="h-9 font-bold text-sm text-center"
                            />
                          </div>
                        )}
                        <div className="relative group/price w-[120px]">
                          <span className={cn("absolute top-2.5 text-zinc-400 dark:text-zinc-500 text-xs font-bold transition-colors group-focus-within/price:text-indigo-600 dark:group-focus-within/price:text-indigo-400", isRtl ? "right-3" : "left-3")}>{currencySymbol}</span>
                          <Label htmlFor={`service-price-${index}`} className="sr-only">Amount for {service.title}</Label>
                          <Input
                            id={`service-price-${index}`}
                            type="number"
                            placeholder="0.00"
                            value={service.amount}
                            onChange={(e) => handleAmountChange(index, e.target.value)}
                            required={service.selected}
                            className={cn("h-9 bg-white dark:bg-zinc-900 border-indigo-200 dark:border-indigo-800 font-bold text-sm text-indigo-700 dark:text-indigo-400 shadow-inner focus-visible:ring-indigo-500/30 transition-colors", isRtl ? "pr-7" : "pl-7")}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-6 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 rounded-b-xl px-6 md:px-8 py-8 mt-auto">

        {/* DELIVERY OPTIONS */}
        <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm gap-4 transition-colors">
          <div className="flex items-start sm:items-center gap-4 w-full">
            <div className={`p-2.5 rounded-lg transition-colors border ${sendEmail ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" : "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800"}`}>
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <Label htmlFor="send-email" className="font-extrabold text-xs uppercase tracking-wider text-zinc-900 dark:text-zinc-100 cursor-pointer block">
                {t("email_delivery")}
              </Label>
              {selectedClient && !selectedClient.email ? (
                <p className="text-xs text-rose-500 dark:text-rose-400 font-bold uppercase tracking-widest mt-1">{t("email_unavailable")}</p>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed mt-0.5 max-w-sm">{t("email_desc")}</p>
              )}
            </div>
          </div>
          <div className="ms-14 sm:ms-0 shrink-0">
            <Checkbox
              id="send-email"
              checked={sendEmail}
              onCheckedChange={() => setSendEmail(!sendEmail)}
              disabled={!selectedClient?.email}
            />
          </div>
        </div>

        <div className="flex justify-between items-center w-full mt-2 bg-white dark:bg-zinc-950 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <span className="text-zinc-500 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-widest">
            {t("total_preview", { taxLabel })}
          </span>
          <span className="text-3xl font-black text-indigo-700 dark:text-indigo-400 drop-shadow-sm tracking-tight">{fCurrency(totalAmount)}</span>
        </div>

        <div className={cn("rounded-xl border p-4 shadow-sm", companyConfirmed ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-100">
                <Building2 className="h-4 w-4 text-indigo-500" /> Confirm active company before invoice generation
              </div>
              <div className="grid gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 md:grid-cols-3">
                <div><span className="block uppercase tracking-widest text-zinc-500">Legal name</span>{companyConfirmation?.companyName || companyConfirmation?.proprietorName || "Not configured"}</div>
                <div><span className="block uppercase tracking-widest text-zinc-500">{companyConfirmation?.taxIdLabel || "Tax ID"}</span>{companyTaxId}</div>
                <div><span className="block uppercase tracking-widest text-zinc-500">Bank / payment identity</span><span className="inline-flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> {bankIdentity}{paymentIdentity ? ` · ${paymentIdentity}` : ""}</span></div>
              </div>
              {recentCompanySwitch?.switchedAt && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white/70 p-3 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  You recently switched to {recentCompanySwitch.name || "this company"}. Double-check the legal name, tax ID, and bank/payment identity before sending this invoice.
                </div>
              )}
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              <Checkbox checked={companyConfirmed} onCheckedChange={(checked) => setCompanyConfirmed(Boolean(checked))} /> Confirm
            </label>
          </div>
        </div>

        <FormSubmitBar
          isSubmitting={isGenerating}
          isDisabled={totalAmount === 0 || !companyConfirmed}
          submitText={t("generate_btn")}
          submittingText={sendEmail ? "Generating & Sending Invoice..." : "Generating Invoice..."}
          helperText={totalAmount === 0 ? "Select at least one priced service to continue." : "Review the preview amount and continue to confirmation."}
        />

        {/* SUCCESS BANNER */}
        {successData && (
          <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500" aria-live="polite">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> {t("generated_success", { invoiceNumber: successData.invoiceNumber })}
              </p>
              <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 text-xs font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all" asChild>
                <a href={getBustedUrl(successData.pdfPath)} target="_blank">{t("download_pdf")}</a>
              </Button>
            </div>

            {/* EMAIL STATUS BANNER */}
            {successData.emailStatus !== "Not requested" && (
              <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center sm:justify-start gap-2 border shadow-sm ${successData.emailStatus === "Success" ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-900/50 dark:text-blue-400" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-900/50 dark:text-red-400"}`}>
                <Mail className="w-4 h-4" />
                {t("email_delivery_status", { status: successData.emailStatus || "Unknown" })}
              </div>
            )}
            {successData.paymentLinkStatus && !successData.paymentLinkStatus.created && (
              <div className="p-4 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center sm:justify-start gap-2 border shadow-sm bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-900/50 dark:text-amber-400">
                <AlertCircle className="w-4 h-4" />
                Payment link was not added ({successData.paymentLinkStatus.skipReason ?? "UNKNOWN_REASON"}).
              </div>
            )}
          </div>
        )}

        <FormFieldMessages
          errorText={error ? <span className="flex items-center justify-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</span> : undefined}
          className="w-full p-4 bg-red-50 dark:bg-red-500/10 border-s-4 border-red-500 rounded-e-xl text-xs text-center font-bold uppercase tracking-widest shadow-sm animate-pulse"
        />
      </CardFooter>
    </form>
  );

  if (inModal) {
    return (
      <>
        {draftPreview ? confirmStepContent : formContent}
        <TaxRateModal
          open={taxRateModalOpen}
          onOpenChange={setTaxRateModalOpen}
          taxLabel={taxRateMeta.taxLabel}
          countryCode={taxRateMeta.countryCode}
          candidates={taxRateMeta.candidates}
          value={taxRateInput}
          onValueChange={setTaxRateInput}
          onConfirm={handleTaxRateConfirm}
          isSubmitting={isGenerating}
          title="Tax rate required to continue"
          description="We couldn't detect a single applicable rate from your service metadata. Enter it once and we'll remember it for your workspace."
        />
      </>
    );
  }

  return (
    <>
      <Card className="shadow-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 w-full" />
        {draftPreview ? confirmStepContent : formContent}
      </Card>
      <TaxRateModal
        open={taxRateModalOpen}
        onOpenChange={setTaxRateModalOpen}
        taxLabel={taxRateMeta.taxLabel}
        countryCode={taxRateMeta.countryCode}
        candidates={taxRateMeta.candidates}
        value={taxRateInput}
        onValueChange={setTaxRateInput}
        onConfirm={handleTaxRateConfirm}
        isSubmitting={isGenerating}
        title="Tax rate required to continue"
        description="We couldn't detect a single applicable rate from your service metadata. Enter it once and we'll remember it for your workspace."
      />
    </>
  );
}
