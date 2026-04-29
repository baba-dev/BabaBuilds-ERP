export type CountryPackVerificationStatus = "verified" | "partial" | "not_verified";

export function getCountryPackVerificationStatus(countryCode: string | null | undefined): CountryPackVerificationStatus {
  const normalized = String(countryCode ?? "").trim().toUpperCase();
  if (!normalized) return "not_verified";
  if (normalized === "IN") return "verified";
  if (normalized === "US" || normalized === "AE" || normalized === "OM" || normalized === "GB" || normalized === "EU") {
    return "partial";
  }
  return "not_verified";
}

export function getCountryPackStatusCopy(status: CountryPackVerificationStatus): {
  title: string;
  description: string;
} {
  if (status === "verified") {
    return {
      title: "Country pack verified",
      description: "Tax-ready invoicing and compliance workflow are backed by verified country-pack content.",
    };
  }
  if (status === "partial") {
    return {
      title: "Country pack partially verified",
      description: "Use tax-ready invoicing and compliance workflows. Filing automation remains pack-verification dependent.",
    };
  }
  return {
    title: "Country pack not verified",
    description: "Use tax-ready invoicing and compliance workflows only. Do not treat this as automated filing advice.",
  };
}
