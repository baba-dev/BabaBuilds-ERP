export const INTELLIGENCE_SUGGESTION_ROUTES = {
  fixImports: "/import-manager",
  finishOnboarding: "/setup",
  reviewReceivables: "/income",
  reconcileBooks: "/reconciliation",
  launchStorefront: "/shop",
  scaleBilling: "/invoice",
} as const;

export type IntelligenceSuggestionRouteKey = keyof typeof INTELLIGENCE_SUGGESTION_ROUTES;
export type IntelligenceSuggestionRoute = (typeof INTELLIGENCE_SUGGESTION_ROUTES)[IntelligenceSuggestionRouteKey];
