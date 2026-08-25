"use client";

import { useEffect } from "react";
import { captureAdsAttributionFromLocation } from "@/lib/ads-attribution";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";

/** Captures campaign parameters into sessionStorage only after measurement consent. */
export default function AdsAttributionCapture() {
  useEffect(() => {
    if (hasMarketingCookieConsent()) {
      captureAdsAttributionFromLocation();
    }
    const onConsentChange = (event: Event) => {
      const choice = (event as CustomEvent<CookieConsentChoice>).detail;
      if (choice === "accepted") captureAdsAttributionFromLocation();
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
  }, []);
  return null;
}
