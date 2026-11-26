"use client";

import { useEffect, useState } from "react";
import { fetchPublicPricingConfig } from "@/lib/owner-pricing-api";

/**
 * The return-journey discount percentage customers actually get right now, for the "5% off"
 * badges on the Return buttons.
 *
 * Owner, 26 Nov 2026: while a scheduled promo offer (Black Friday) runs, the server's public
 * pricing feed reports a 0% return discount, so the badge hides itself; it returns automatically
 * when the offer ends. Returns null until the feed has loaded (never shows a claim we haven't
 * confirmed) and null whenever the rate is 0.
 */
let pricingPromise: Promise<number> | null = null;

export function loadReturnDiscountPercent(): Promise<number> {
  if (!pricingPromise) {
    pricingPromise = fetchPublicPricingConfig()
      .then((config) => {
        const rate = Number(config.returnDiscount?.rate);
        return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 1000) / 10 : 0;
      })
      .catch(() => {
        pricingPromise = null; // try again next time rather than caching a failure
        return 0;
      });
  }
  return pricingPromise;
}

/** Test hook: forget the cached pricing feed. */
export function resetReturnDiscountPercentCache(): void {
  pricingPromise = null;
}

export function returnDiscountBadgeText(percent: number | null, style: "off" | "save"): string | null {
  if (!percent || percent <= 0) return null;
  return style === "save" ? `Save ${percent}%` : `${percent}% off`;
}

export function useReturnDiscountPercent(): number | null {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void loadReturnDiscountPercent().then((p) => {
      if (live) setPercent(p);
    });
    return () => {
      live = false;
    };
  }, []);
  return percent;
}
