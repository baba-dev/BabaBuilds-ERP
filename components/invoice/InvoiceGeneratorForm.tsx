"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, ChevronDown, Mail, Building2, Landmark } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { GstPreviewCard, useGstPreview, type GstOverrides, type GstPreviewLine } from "@/components/gst/GstPreviewCard";
import { TaxRateModal } from "@/components/invoice/tax-rate-modal";
import { DatePickerField } from "@/components/forms/date-picker-field";
import { SearchableCombobox } from "@/components/forms/searchable-combobox";
import { FormFieldMessages } from "@/components/forms/form-primitives";
import { Switch } from "@/components/ui/switch";
import { ComposerSection } from "@/components/invoice/composer/ComposerSection";
import { LineItems } from "@/components/invoice/composer/LineItems";
import { SummaryPanel } from "@/components/invoice/composer/SummaryPanel";
import { SuccessPanel } from "@/components/invoice/composer/SuccessPanel";

// MISSION CRITICAL: Globalization & Caching Imports
import { useFormat } from "@/hooks/use-format";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { InvoiceCurrencyField } from "@/components/invoice/InvoiceCurrencyField";
import { useTranslations } from "next-intl";
import { getConflictPolicy, queueOfflineMutation } from "@/lib/offline-sync";
import { cn } from "@/lib/utils";
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

type ApiList<T> = T[] | { data?: T[] } | null | undefined;

const unwrapList = <T,>(result: ApiList<T>): T[] => {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.data) ? result.data : [];
};

type ClientRow = { id: string | number; name: string; country: string; email?: string | null };
type SacValue = string | number | { code?: string; value?: string; label?: string } | null;
type BillingMonthRow = { billingMonth?: string | null; clientId?: string | null };
type ServiceRow = { id: string; name: string; description?: string | null; sacCode?: SacValue; defaultPrice?: number | string | null };
type ProductRow = { id: string; name: string; sku?: string | null; category?: string | null; baselinePrice?: number | string | null; costPrice?: number | string | null; currentStock?: number | null };
type CatalogEntry = {
  id: string;
  selected: boolean;
  title: string;
  nicDetails: string;
  sac: SacValue;
  amount: string;
  quantity: number;
  unitPrice: number;
  defaultPrice: number;
  isProduct: boolean;
  productId: string | null;
  currentStock: number;
};

interface InvoiceGeneratorFormProps {
  /** Called with the generated invoice data after a successful submission. Pass to close the modal. */
  onSuccess?: (data: {
    pdfPath: string;
    invoiceNumber: string;
    emailStatus?: string;
    paymentLinkStatus?: { attempted: boolean; created: boolean; skipReason: string | null };
  }) => void;
}

export default function InvoiceGeneratorForm({ onSuccess }: InvoiceGeneratorFormProps) {
  const t = useTranslations("Invoice");
  const tc = useTranslations("InvoiceComposer");
  const reduceMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const presetServiceId = searchParams.get("service");
  const presetClientId = searchParams.get("client");
  const presetApplied = useRef({ service: false, client: false });
  const [showCompanyDetails, setShowCompanyDetails] = useState(false);
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
  // "" = same as the workspace base currency.
  const [invoiceCurrency, setInvoiceCurrency] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [gstOverrides, setGstOverrides] = useState<GstOverrides>({});

  // --- GLOBALIZATION ENGINE ---
  const {
    currency,
    locale,
    dateFormat = "dd/MM/yyyy",
    taxLabel,
    countryCode = "Global",
  } = useFormat();

  const activeCurrency = invoiceCurrency || currency;
  const fCurrency = (amount: number | string | null | undefined) => formatCurrency(amount, activeCurrency, locale);
  const currencySymbol = getCurrencySymbol(activeCurrency, locale);
  const isForeignCurrency = activeCurrency !== currency;
  const gstPayload = gstOverrides.placeOfSupply || gstOverrides.supplyOverride || gstOverrides.reverseCharge ? { gst: gstOverrides } : {};
  const currencyPayload = isForeignCurrency ? { currency: activeCurrency, exchangeRate: Number(exchangeRate) } : {};

  // App State
  const [clients, setClients] = useState<ClientRow[]>([]);
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
  const [services, setServices] = useState<CatalogEntry[]>([]);
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
      const parsedClients = unwrapList<ClientRow>(clientsResult);
      if (Array.isArray(parsedClients)) setClients(parsedClients);

      const parsedBillingMonths = unwrapList<BillingMonthRow>(invoicesResult);
      if (Array.isArray(parsedBillingMonths)) {
        setExistingInvoices(
          parsedBillingMonths.map((row) => ({
            billingMonth: String(row?.billingMonth || ""),
            clientId: row?.clientId ? String(row.clientId) : null,
          })),
        );
      }

      const parsedServices = unwrapList<ServiceRow>(servicesResult);
      const mappedCatalog: CatalogEntry[] = [];
      if (Array.isArray(parsedServices)) {
        parsedServices.forEach((srv) => {
          mappedCatalog.push({
            id: srv.id,
            selected: false,
            title: srv.name,
            nicDetails: srv.description || "Standard Service Rendered",
            sac: srv.sacCode || (countryCode === "IN" ? "998313" : "GENERIC"),
            amount: "",
            quantity: 1,
            unitPrice: Number(srv.defaultPrice || 0),
            defaultPrice: Number(srv.defaultPrice || 0),
            isProduct: false,
            productId: null,
            currentStock: 0,
          });
        });
      }

      const parsedProducts: ProductRow[] = Array.isArray(productsResult) ? productsResult : [];
      if (Array.isArray(parsedProducts)) {
        parsedProducts.forEach((p) => {
          mappedCatalog.push({
            id: p.id,
            selected: false,
            title: p.name,
            nicDetails: `SKU: ${p.sku}`,
            sac: p.category || "GOODS",
            amount: "",
            quantity: 1,
            unitPrice: Number(p.baselinePrice || p.costPrice || 0),
            defaultPrice: Number(p.baselinePrice || p.costPrice || 0),
            isProduct: true,
            productId: p.id,
            currentStock: p.currentStock ?? 0,
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

  // Deep links: /income/new?service=<id>&client=<id> (from the catalogue and client pages).
  useEffect(() => {
    if (!presetApplied.current.client && presetClientId && clients.length > 0) {
      presetApplied.current.client = true;
      if (clients.some((c) => c.id.toString() === presetClientId)) setSelectedClientId(presetClientId);
    }
  }, [clients, presetClientId]);

  useEffect(() => {
    if (presetApplied.current.service || !presetServiceId || services.length === 0) return;
    const index = services.findIndex((s) => s.id === presetServiceId && !s.isProduct);
    presetApplied.current.service = true;
    if (index >= 0 && !services[index].selected) handleServiceToggle(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply the preset once, when the catalogue first loads
  }, [services, presetServiceId]);

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
    if (isForeignCurrency && !(Number(exchangeRate) > 0)) { setError(`Enter the exchange rate from ${activeCurrency} to ${currency}.`); return; }

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
          ...gstPayload,
          services: validServices,
          customDate: invoiceDate.toISOString(),
          ...currencyPayload,
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
            ...gstPayload,
              ...gstPayload,
          ...gstPayload,
              services: validServices,
              customDate: invoiceDate.toISOString(),
          ...currencyPayload,
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
            ...gstPayload,
          ...gstPayload,
            services: activeServices.filter((s) => Number(s.amount) > 0),
            customDate: invoiceDate.toISOString(),
          ...currencyPayload,
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
          ...gstPayload,
          services: validServices,
          customDate: invoiceDate.toISOString(),
          ...currencyPayload,
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
            ...gstPayload,
              ...gstPayload,
          ...gstPayload,
              services: validServices,
              customDate: invoiceDate.toISOString(),
          ...currencyPayload,
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
            ...gstPayload,
          ...gstPayload,
            services: activeServices.filter((s) => Number(s.amount) > 0),
            customDate: invoiceDate.toISOString(),
          ...currencyPayload,
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
    <div className="mx-auto max-w-3xl rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-8">
      <div>
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
      </div>
    </div>
  ) : null;

  const previewLines: GstPreviewLine[] = activeServices.map((s) => ({
    description: s.title,
    amount: Number(s.amount || 0),
    quantity: s.quantity,
    sacCode: s.isProduct ? null : typeof s.sac === "object" && s.sac ? s.sac.code ?? s.sac.value ?? null : typeof s.sac === "string" || typeof s.sac === "number" ? String(s.sac) : null,
    ratePercent: typeof s.sac === "object" && s.sac && typeof (s.sac as { igstRate?: unknown }).igstRate === "number" ? (s.sac as { igstRate: number }).igstRate : null,
    goods: s.isProduct,
    productId: s.productId,
  }));
  const gstView = useGstPreview({ clientId: selectedClientId || null, lines: previewLines, overrides: gstOverrides, exchangeRate: isForeignCurrency && Number(exchangeRate) > 0 ? Number(exchangeRate) : null });
  const selectedLines = activeServices.map((s) => ({ id: s.id, title: s.title, quantity: s.quantity, amount: Number(s.amount || 0) }));
  const checks = { client: Boolean(selectedClientId), items: totalAmount > 0, company: companyConfirmed };
  const canSubmit = checks.client && checks.items && checks.company;
  const submitLabel = tc("summary.review");
  const submittingLabel = sendEmail ? tc("summary.generatingSending") : tc("summary.generating");
  const effectiveRate = isForeignCurrency && Number(exchangeRate) > 0 ? Number(exchangeRate) : null;
  const money = (n: number) => fCurrency(n);

  const formContent = (
    <form onSubmit={handleSubmit} noValidate className="pb-32 lg:pb-0">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <ComposerSection step={1} title={tc("billTo.title")} hint={tc("billTo.hint")} done={checks.client} delay={0}>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="invoice-client" className="text-sm font-medium">{t("billing_to")}</Label>
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
                  className="h-12 rounded-xl text-base"
                />
                <AnimatePresence initial={false}>
                  {selectedClient && (
                    <motion.p
                      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden text-sm text-muted-foreground"
                    >
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden /> {t("jurisdiction", { country: selectedClient.country })}</span>
                      <span className={selectedClient.email ? "" : "text-amber-700 dark:text-amber-400"}>{selectedClient.email ?? tc("billTo.noEmail")}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoice-date" className="text-sm font-medium">{t("document_date")}</Label>
                  <DatePickerField
                    value={invoiceDate}
                    onChange={setInvoiceDate}
                    placeholder={t("pick_date")}
                    formatString={dateFormat}
                    buttonClassName="h-12 w-full rounded-xl text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice-cycle" className="text-sm font-medium">{t("cycle_period")}</Label>
                  <Select value={billingMonth} onValueChange={setBillingMonth}>
                    <SelectTrigger id="invoice-cycle" className="h-12 w-full rounded-xl text-base">
                      <SelectValue placeholder={t("select_month")} />
                    </SelectTrigger>
                    <SelectContent>
                      {isMounted && monthOptions.map((month) => <SelectItem key={month} value={month}>{month}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <InvoiceCurrencyField
                baseCurrency={currency}
                value={invoiceCurrency}
                exchangeRate={exchangeRate}
                onChange={(next) => { setInvoiceCurrency(next.currency); setExchangeRate(next.exchangeRate); }}
                labels={{
                  currency: tc("billTo.currency"),
                  rate: ({ from, to }) => tc("billTo.rate", { from, to }),
                  rateHint: ({ from, to }) => tc("billTo.rateHint", { from, to }),
                }}
              />

              <AnimatePresence initial={false}>
                {isMonthAlreadyBilled && (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>{t("warning_duplicate", { billingMonth })}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ComposerSection>

          <ComposerSection step={2} title={tc("items.title")} hint={tc("items.hint")} done={checks.items} delay={0.06}>
            <LineItems
              items={services}
              loading={isLoadingServices}
              currencySymbol={currencySymbol}
              format={money}
              onToggle={handleServiceToggle}
              onAmount={handleAmountChange}
              onQuantity={handleQuantityChange}
            />
          </ComposerSection>

          <GstPreviewCard preview={gstView.preview} loading={gstView.loading} format={(n) => fCurrency(n)} overrides={gstOverrides} onOverridesChange={setGstOverrides} />

          <ComposerSection step={3} title={tc("delivery.title")} hint={tc("delivery.hint")} done={checks.company} delay={0.12}>
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border/70 p-3 sm:p-4">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors", sendEmail ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" : "bg-muted text-muted-foreground")}>
                  <Mail className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <Label htmlFor="send-email" className="block cursor-pointer text-sm font-semibold">{t("email_delivery")}</Label>
                  <p className={cn("text-xs", selectedClient && !selectedClient.email ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                    {selectedClient && !selectedClient.email ? t("email_unavailable") : t("email_desc")}
                  </p>
                </div>
                <Switch id="send-email" checked={sendEmail} onCheckedChange={setSendEmail} disabled={!selectedClient?.email} />
              </div>

              <div className={cn("rounded-xl border p-3 transition-colors sm:p-4", companyConfirmed ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-indigo-600 shadow-sm dark:text-indigo-300"><Building2 className="size-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{tc("delivery.issuedBy")}</p>
                    <p className="truncate font-semibold">{companyConfirmation?.companyName || companyConfirmation?.proprietorName || tc("delivery.notConfigured")}</p>
                    <p className="text-xs text-muted-foreground">{companyConfirmation?.taxIdLabel || tc("delivery.taxId")}: {companyTaxId}</p>
                  </div>
                  <button type="button" onClick={() => setShowCompanyDetails((v) => !v)} aria-expanded={showCompanyDetails} className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={tc("delivery.details")}>
                    <ChevronDown className={cn("size-4 transition-transform", showCompanyDetails && "rotate-180")} aria-hidden />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {showCompanyDetails && (
                    <motion.dl initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 grid gap-2 overflow-hidden text-sm sm:grid-cols-2">
                      <div><dt className="text-xs text-muted-foreground">{tc("delivery.bank")}</dt><dd className="inline-flex items-center gap-1.5 font-medium"><Landmark className="size-3.5" aria-hidden /> {bankIdentity}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">{tc("delivery.payment")}</dt><dd className="font-medium">{paymentIdentity}</dd></div>
                    </motion.dl>
                  )}
                </AnimatePresence>
                {recentCompanySwitch?.switchedAt && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-background/70 p-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {tc("delivery.recentSwitch", { name: recentCompanySwitch.name || tc("delivery.thisCompany") })}
                  </p>
                )}
                <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <Checkbox checked={companyConfirmed} onCheckedChange={(checked) => setCompanyConfirmed(Boolean(checked))} />
                  {tc("delivery.confirm")}
                </label>
              </div>
            </div>
          </ComposerSection>

          <AnimatePresence initial={false}>
            {error && (
              <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm font-medium text-rose-800 dark:text-rose-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sticky below the page header (~10rem) so it follows the form while scrolling. */}
        <div className="hidden lg:sticky lg:top-40 lg:block">
          <SummaryPanel
            clientName={selectedClient?.name ?? null}
            currency={activeCurrency}
            baseCurrency={currency}
            exchangeRate={effectiveRate}
            lines={selectedLines}
            total={totalAmount}
            format={money}
            taxLabel={taxLabel}
            checks={checks}
            submitting={isGenerating}
            submittingLabel={submittingLabel}
            submitLabel={submitLabel}
            canSubmit={canSubmit}
          />
        </div>
      </div>

      <SummaryPanel
        compact
        clientName={selectedClient?.name ?? null}
        currency={activeCurrency}
        baseCurrency={currency}
        exchangeRate={effectiveRate}
        lines={selectedLines}
        total={totalAmount}
        format={money}
        taxLabel={taxLabel}
        checks={checks}
        submitting={isGenerating}
        submittingLabel={submittingLabel}
        submitLabel={submitLabel}
        canSubmit={canSubmit}
      />
    </form>
  );

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {successData ? (
          <SuccessPanel
            key="success"
            invoiceNumber={successData.invoiceNumber}
            pdfPath={successData.pdfPath}
            emailStatus={successData.emailStatus}
            paymentLinkStatus={successData.paymentLinkStatus}
            onAnother={() => setSuccessData(null)}
          />
        ) : draftPreview ? (
          <motion.div key="confirm" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {confirmStepContent}
          </motion.div>
        ) : (
          <motion.div key="form" initial={false} exit={{ opacity: 0 }}>
            {formContent}
          </motion.div>
        )}
      </AnimatePresence>
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
