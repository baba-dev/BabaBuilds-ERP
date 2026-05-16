import type { DemoTemplateKey } from "@/lib/demo/templates";

export type PersonaTestimonial = {
  quote: string;
  author: string;
  role: string;
};

export type PersonaConfig = {
  slug: "for-ca" | "for-agencies" | "for-contractors" | "for-small-businesses" | "for-freelancers";
  namespace: string;
  /** Signup-intent persona enum passed to /signup */
  signupPersona: "ca" | "agency" | "freelancer" | "contractor";
  primaryCtaHref: string;
  secondaryCtaTemplateKey: DemoTemplateKey;
};

function trialSignupHref(persona: PersonaConfig["signupPersona"], source: string): string {
  return `/signup?plan=pro&cycle=monthly&trial=15&persona=${persona}&source=${source}`;
}

export const personaConfigs: Record<PersonaConfig["slug"], PersonaConfig> = {
  "for-ca": {
    slug: "for-ca",
    namespace: "forCa",
    signupPersona: "ca",
    primaryCtaHref: trialSignupHref("ca", "persona_for_ca"),
    secondaryCtaTemplateKey: "tax_agency",
  },
  "for-agencies": {
    slug: "for-agencies",
    namespace: "forAgencies",
    signupPersona: "agency",
    primaryCtaHref: trialSignupHref("agency", "persona_for_agencies"),
    secondaryCtaTemplateKey: "dm_agency",
  },
  "for-contractors": {
    slug: "for-contractors",
    namespace: "forContractors",
    signupPersona: "contractor",
    primaryCtaHref: trialSignupHref("contractor", "persona_for_contractors"),
    secondaryCtaTemplateKey: "contractor_builder",
  },
  "for-small-businesses": {
    slug: "for-small-businesses",
    namespace: "forSmallBusinesses",
    signupPersona: "freelancer",
    primaryCtaHref: trialSignupHref("freelancer", "persona_for_small_business"),
    secondaryCtaTemplateKey: "dm_agency",
  },
  "for-freelancers": {
    slug: "for-freelancers",
    namespace: "forFreelancers",
    signupPersona: "freelancer",
    primaryCtaHref: trialSignupHref("freelancer", "persona_for_freelancers"),
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
    labelKey: `${config.namespace}.navLabel`,
    href: `/${slug}`,
  };
});
