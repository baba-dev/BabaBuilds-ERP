export const INTELLIGENCE_SUGGESTION_ROUTES = {
  fixImports: "/settings/imports",
  finishOnboarding: "/settings",
  reviewReceivables: "/invoice",
  reconcileBooks: "/reconciliation",
  launchStorefront: "/settings/shop",
  scaleBilling: "/invoice",
} as const;

export type IntelligenceSuggestionRouteKey = keyof typeof INTELLIGENCE_SUGGESTION_ROUTES;
export type IntelligenceSuggestionRoute = (typeof INTELLIGENCE_SUGGESTION_ROUTES)[IntelligenceSuggestionRouteKey];
