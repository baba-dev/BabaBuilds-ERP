import { useSession } from "next-auth/react";
import { formatCurrency } from "@/lib/currency";

export function useFormat() {
  const { data: session } = useSession();
  
  // These values should ideally be added to your Session object in lib/auth.ts
  const s = session as { user?: { currencyFormat?: string }, baseCurrency?: string, locale?: string } | null;
  const currency = s?.user?.currencyFormat || s?.baseCurrency || "INR";
  const locale = s?.locale || "en-IN";

  // --- GLOBALIZATION LOGIC ---
  // Determine if the user is in the Indian jurisdiction
  const isIndia = locale === "en-IN" || currency === "INR";

  // Set the format variables based on the jurisdiction
  const dateFormat = isIndia ? "dd/MM/yyyy" : "MM/dd/yyyy";
  const taxLabel = isIndia ? "GST" : "VAT / Tax";
  const taxIdLabel = isIndia ? "GSTIN" : "Tax ID";
  const countryCode = isIndia ? "IN" : "Global";

  return {
    fCurrency: (amount: number | string | { toString(): string } | null | undefined) => 
      formatCurrency(amount, currency, locale),
    currency,
    locale,
    // Exporting the newly created variables so your components can use them
    dateFormat,
    taxLabel,
    taxIdLabel,
    countryCode
  };
}