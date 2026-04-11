"use client";

export type SidebarAnalyticsEventName =
  | "sidebar_item_click"
  | "sidebar_search_query"
  | "sidebar_search_no_results"
  | "sidebar_ask_ai_click"
  | "sidebar_pin_add"
  | "sidebar_pin_remove"
  | "sidebar_group_toggle"
  | "sidebar_resize"
  | "sidebar_collapse_toggle";

export type SidebarAnalyticsPayload = {
  route: string;
  role: string;
  module: string;
  [key: string]: string | number | boolean | null | undefined;
};

export function emitSidebarAnalyticsEvent(name: SidebarAnalyticsEventName, payload: SidebarAnalyticsPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const detail = {
    event: name,
    payload,
    emittedAt: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("app:analytics", { detail }));

  if (process.env.NODE_ENV !== "production") {
    console.info("[analytics]", detail);
  }
}
