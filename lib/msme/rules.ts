/**
 * Small-business rules in one place so a notification or Budget change is a one-file edit.
 * Sources: CGST Act s.22-23 and Notifications 10/2019-CT, 10/2017-IT, 2/2019-CT(R) (registration, composition);
 * MSME Ministry S.O. 1364(E) of 21 March 2025 (classification, from 1 April 2025); MSMED Act 2006 ss.15-16 and
 * Income-tax s.43B(h) (payment to micro and small enterprises). They are shown as guidance, never as filing advice:
 * confirm against the portal and notification before acting.
 */
export const MSME_RULES = {
  /** GST aggregate-turnover thresholds for registration, in INR. */
  gst: {
    services: 2_000_000,
    goods: 4_000_000,
    /** Special-category states (Manipur, Mizoram, Nagaland, Tripura): services 10 lakh, goods 20 lakh. */
    servicesSpecial: 1_000_000,
    goodsSpecial: 2_000_000,
    specialStateCodes: ["13", "14", "15", "16"],
    /** The app warns once turnover reaches this share of the threshold. */
    warnShare: 0.8,
    /** A business that crosses the threshold has this many days to apply for registration. */
    applyWithinDays: 30,
  },
  /** Composition scheme. Services: section 10(2A) at 6%, up to 50 lakh. Goods/manufacture: 1%, up to 1.5 crore. Intra-state only. */
  composition: {
    services: { limit: 5_000_000, rate: 6 },
    goods: { limit: 15_000_000, limitSpecial: 7_500_000, rate: 1 },
  },
  /** MSME classification: BOTH investment (plant and machinery / equipment) and turnover must fall within a band. INR. */
  classification: {
    micro: { investment: 25_000_000, turnover: 100_000_000 },
    small: { investment: 250_000_000, turnover: 1_000_000_000 },
    medium: { investment: 1_250_000_000, turnover: 5_000_000_000 },
  },
  /** Payment to micro and small enterprises: within the agreed period, at most 45 days; 15 days if there is no written agreement. */
  payment: { maxDays: 45, noAgreementDays: 15 },
  /** Presumptive schemes a small proprietor may use (see lib/ca/rules.ts for the full limits). */
  udyamPattern: /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/,
} as const;

export const MSME_RULES_NOTE =
  "Thresholds and limits follow public notifications (GST, MSME Ministry, Income-tax) as understood at build time. Confirm on the GST portal, udyamregistration.gov.in and with your CA.";
