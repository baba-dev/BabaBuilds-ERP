import type { DemoTemplateKey } from "@/lib/demo/templates";

export type PersonaTestimonial = {
  quote: string;
  author: string;
  role: string;
};

export type PersonaConfig = {
  slug: "for-ca" | "for-agencies" | "for-contractors" | "for-small-businesses" | "for-freelancers";
  namespace: string;
  primaryCtaHref: string;
  secondaryCtaTemplateKey: DemoTemplateKey;
};

export const personaConfigs: Record<PersonaConfig["slug"], PersonaConfig> = {
  "for-ca": {
    slug: "for-ca",
    namespace: "forCa",
    primaryCtaHref: "/signup?plan=pro&cycle=monthly&trial=15&source=persona",
    secondaryCtaTemplateKey: "tax_agency",
  },
  "for-agencies": {
    slug: "for-agencies",
    namespace: "forAgencies",
    primaryCtaHref: "/signup?plan=pro&cycle=monthly&trial=15&source=persona",
    secondaryCtaTemplateKey: "dm_agency",
  },
  "for-contractors": {
    slug: "for-contractors",
    namespace: "forContractors",
    primaryCtaHref: "/signup?plan=pro&cycle=monthly&trial=15&source=persona",
    secondaryCtaTemplateKey: "contractor_builder",
  },
  "for-small-businesses": {
    slug: "for-small-businesses",
    namespace: "forSmallBusinesses",
    primaryCtaHref: "/signup?plan=pro&cycle=monthly&trial=15&source=persona",
    secondaryCtaTemplateKey: "dm_agency",
  },
  "for-freelancers": {
    slug: "for-freelancers",
    namespace: "forFreelancers",
    primaryCtaHref: "/signup?plan=pro&cycle=monthly&trial=15&source=persona",
    secondaryCtaTemplateKey: "freelancer_consultant",
  },
};

export const personaOrder: PersonaConfig["slug"][] = [
  "for-ca",
  "for-agencies",
  "for-contractors",
  "for-small-businesses",
  "for-freelancers",
];

export const personaNavigationLinks = personaOrder.map((slug) => {
  const config = personaConfigs[slug];
  return {
    labelKey: `LandingPersona.${config.namespace}.navLabel`,
    href: `/${slug}`,
  };
});
