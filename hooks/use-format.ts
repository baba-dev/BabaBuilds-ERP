import { useSession } from "next-auth/react";
import { formatCurrency } from "@/lib/currency";
import { getCompliancePack } from "@/lib/tax/compliance-packs";

export function useFormat() {
  const { data: session } = useSession();
  
  const s = session as { 
    user?: { currencyFormat?: string, countryCode?: string }, 
    baseCurrency?: string, 
    locale?: string,
    countryCode?: string 
  } | null;

  const currency = s?.user?.currencyFormat || s?.baseCurrency || "INR";
  const locale = s?.locale || "en-IN";
  const countryCode = s?.user?.countryCode || s?.countryCode || (currency === "INR" ? "IN" : "US");

  const pack = getCompliancePack(countryCode);

  // Set the format variables based on the jurisdiction pack
  const dateFormat = countryCode === "US" ? "MM/dd/yyyy" : "dd/MM/yyyy";
  const taxLabel = pack?.labels.indirectTaxName || "VAT / Tax";
  const taxIdLabel = pack?.labels.registrationLabel || "Tax ID";
  const displayCountryCode = countryCode;

  return {
    fCurrency: (amount: number | string | { toString(): string } | null | undefined) => 
      formatCurrency(amount, currency, locale),
    currency,
    locale,
    dateFormat,
    taxLabel,
    taxIdLabel,
    countryCode: displayCountryCode
  };
}