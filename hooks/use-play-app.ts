"use client";

import { useEffect, useState } from "react";
import { getPlayBillingService, isAndroidAppSession, markAndroidAppSession } from "@/lib/client/play-billing";

export type PlayAppState = {
  /** Resolved on the client after mount (false during SSR / first paint). */
  ready: boolean;
  /** Running inside the Android app: web checkout (Razorpay/Stripe) must not be offered. */
  isAndroidApp: boolean;
  /** Google Play Billing is actually usable here (Digital Goods API present). */
  canUsePlayBilling: boolean;
};

export function usePlayApp(): PlayAppState {
  const [state, setState] = useState<PlayAppState>({ ready: false, isAndroidApp: false, canUsePlayBilling: false });

  useEffect(() => {
    let cancelled = false;
    const isAndroidApp = markAndroidAppSession() || isAndroidAppSession();
    void (async () => {
      const service = isAndroidApp ? await getPlayBillingService() : null;
      if (!cancelled) setState({ ready: true, isAndroidApp, canUsePlayBilling: service !== null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
