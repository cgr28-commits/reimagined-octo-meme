"use client";

import { useEffect, useState } from "react";
import { fetchPublicBookingNotice } from "@/lib/short-notice-api";

let cached: Promise<boolean> | null = null;

/**
 * The owner's 20% deposit switch (dashboard, 15 Nov 2026). True until the Worker says
 * otherwise; the Worker also refuses a deposit checkout while it is off.
 */
export function useCardBalanceDepositEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    cached ??= fetchPublicBookingNotice()
      .then((notice) => notice.cardBalanceDepositEnabled)
      .catch(() => true);
    void cached.then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
