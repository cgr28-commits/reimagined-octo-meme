"use client";
import { useEffect } from "react";
import {
  captureAdsAttributionFromLocation,
  clearStoredAdsAttribution,
} from "@/lib/ads-attribution";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
} from "@/lib/cookie-consent";
export default function AdsAttributionCapture() {
  useEffect(() => {
    const sync = () => {
      if (hasMarketingCookieConsent()) captureAdsAttributionFromLocation();
      else clearStoredAdsAttribution();
    };
    sync();
    window.addEventListener(COOKIE_CONSENT_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, sync);
  }, []);
  return null;
}
