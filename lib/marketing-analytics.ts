"use client";

export type MarketingEventName =
  | "marketing_cta_click"
  | "trial_cta_click"
  | "interactive_demo_click"
  | "interactive_demo_provisioned"
  | "homepage_role_demo_click"
  | "marketing_trial_cta_clicked"
  | "home_v2_hero_demo_click"
  | "home_v2_hero_start_free_click"
  | "home_v2_final_demo_click"
  | "home_v2_final_start_free_click";

export type MarketingEventPayload = {
  location?: string;
  ctaLabel?: string;
  context?: string;
  role?: string;
  templateKey?: string;
  href?: string;
  [key: string]: string | number | boolean | null | undefined;
};

export function emitMarketingAnalyticsEvent(
  event: MarketingEventName,
  payload: MarketingEventPayload,
) {
  if (typeof window === "undefined") return;

  const detail = {
    event,
    payload,
    emittedAt: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("app:analytics", { detail }));

  if (process.env.NODE_ENV !== "production") {
    console.info("[marketing-analytics]", detail);
  }
}
