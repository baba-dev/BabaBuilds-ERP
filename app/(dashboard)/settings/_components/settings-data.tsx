"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** What GET /api/settings returns that the settings screens use. Secrets are never in it, only whether they are set. */
export type SettingsData = {
  companyName?: string; proprietorName?: string; address?: string; email?: string; phone?: string | null; website?: string | null;
  panNumber?: string; gstin?: string | null; udyamNumber?: string | null; defaultSacCode?: string | null; defaultTaxRate?: number | null;
  taxLabel?: string; taxIdLabel?: string; routingLabel?: string;
  invoiceTheme?: string; invoiceAccentColor?: string | null; invoicePrefix?: string | null; invoiceTermsDays?: number;
  bankName?: string; accountName?: string; ifscCode?: string; accountNumberDisplay?: string;
  upiVpa?: string | null; upiPayeeName?: string | null; paymentQrs?: Array<{ id: string; label: string; imageUrl: string }>;
  primaryBankAccount?: { accountNumberDisplay?: string | null; maskedAccountNumber?: string | null } | null;
  logoUrl?: string | null; signatureUrl?: string | null; locale?: string; countryCode?: string;
  smtpHost?: string | null; smtpPort?: number | null; smtpUser?: string | null; smtpFromEmail?: string | null; hasSmtpPassword?: boolean;
  razorpayKeyId?: string | null; stripePublishableKey?: string | null; defaultGateway?: string | null; hasRazorpayKeySecret?: boolean; hasStripeSecretKey?: boolean;
  hasGroqApiKey?: boolean;
  shopEnabled?: boolean; shopSlug?: string | null; shopTagline?: string | null; shopAccentColor?: string | null;
  gstRemindersEnabled?: boolean; gstRegistrationType?: string;
  planTier?: string; subscriptionStatus?: string;
  billingEntitlements?: { canUsePaymentGateways?: boolean };
  canManage?: boolean;
};

export type OverviewCheck = { key: string; section: string; status: "done" | "todo" | "optional" | "na" };
export type SetupOverview = { checks: OverviewCheck[]; percent: number; open: number };

type Ctx = { data: SettingsData | null; overview: SetupOverview | null; loading: boolean; error: boolean; reload: () => void };
const SettingsCtx = createContext<Ctx | null>(null);

/** One fetch for the whole settings area; sections read it and ask for a reload after a save. */
export function SettingsDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [overview, setOverview] = useState<SetupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    if (first.current) first.current = false;
    fetch("/api/settings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as SettingsData;
      })
      .then((d) => { if (!cancelled) { setData(d); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch("/api/settings/overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: SetupOverview | null) => { if (!cancelled && d) setOverview(d); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ data, overview, loading, error, reload }), [data, overview, loading, error, reload]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettingsData(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettingsData must be used inside SettingsDataProvider");
  return ctx;
}

/** Sections report unsaved edits here so the nav can ask before leaving. */
type DirtyCtx = { setDirty: (dirty: boolean) => void; isDirty: () => boolean };
export const DirtyContext = createContext<DirtyCtx>({ setDirty: () => undefined, isDirty: () => false });
export const useDirty = () => useContext(DirtyContext);
