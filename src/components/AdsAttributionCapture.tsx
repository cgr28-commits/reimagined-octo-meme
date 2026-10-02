"use client";

import { useEffect } from "react";
import {
  captureAdsAttributionFromLocation,
  clearStoredAdsAttribution,
  hrefWithPendingAdsAttribution,
  rememberLandingAdsAttribution,
} from "@/lib/ads-attribution";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
  readCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";

/**
 * Remembers gclid / wbraid / gbraid from the landing URL immediately.
 * Writes storage only after measurement consent. A reject clears that storage.
 */
export default function AdsAttributionCapture() {
  useEffect(() => {
    rememberLandingAdsAttribution();
    if (hasMarketingCookieConsent()) {
      captureAdsAttributionFromLocation();
    } else if (readCookieConsent() === "rejected") {
      clearStoredAdsAttribution();
    }

    const onConsentChange = (event: Event) => {
      const choice = (event as CustomEvent<CookieConsentChoice>).detail;
      if (choice === "accepted") {
        captureAdsAttributionFromLocation();
        return;
      }
      clearStoredAdsAttribution();
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      const next = hrefWithPendingAdsAttribution(href, window.location.href);
      if (!next) return;
      anchor.setAttribute("href", next);
      const modified =
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (modified) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(next);
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
