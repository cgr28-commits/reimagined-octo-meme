"use client";

import { useEffect, useRef, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { getGoogleAdsConfig, type AdsQuotePageType } from "@/lib/google-ads";
import {
  isGtagReady,
  trackRequestQuoteConversion,
  type AdsUserData,
} from "@/lib/google-ads-client";

type GoogleAdsRequestQuoteProps = {
  /**
   * Fire quote_generated / Request quote conversion once this becomes true —
   * only when `#quoteResult` confirmation is shown after a successful priced quote.
   */
  fire: boolean;
  /** Required — conversion is skipped without a positive numeric quote amount. */
  value?: number;
  currency?: string;
  /** Required — unique quote / booking reference for deduplication. */
  transactionId?: string;
  pageType?: AdsQuotePageType;
  /** Off by default; never enabled for emerge_belfast. */
  includeUserData?: boolean;
  userData?: AdsUserData;
};

/**
 * Fires the quote Ads conversion after a successful priced quote confirmation
 * is on screen — not on form open, click, validation failure, or API failure.
 */
export default function GoogleAdsRequestQuote({
  fire,
  value,
  currency = "GBP",
  transactionId,
  pageType,
  includeUserData = false,
  userData,
}: GoogleAdsRequestQuoteProps) {
  const config = getGoogleAdsConfig();
  const firedRef = useRef(false);
  const [marketingAllowed, setMarketingAllowed] = useState(false);

  useEffect(() => {
    const sync = () => setMarketingAllowed(hasMarketingCookieConsent());
    sync();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentChoice>).detail;
      setMarketingAllowed(detail === "accepted");
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);

  const userEmail = userData?.email;
  const userPhone = userData?.phone;
  const allowPii = includeUserData === true && pageType !== "emerge_belfast";

  useEffect(() => {
    if (!fire || !config.quoteEnabled || !marketingAllowed || firedRef.current) {
      return;
    }

    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return;
    }
    if (!transactionId?.trim()) {
      return;
    }

    // Only fire when the success panel (#quoteResult) is in the document.
    if (typeof document !== "undefined" && !document.getElementById("quoteResult")) {
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!isGtagReady() && attempts < 20) {
        return;
      }
      const ok = trackRequestQuoteConversion({
        value,
        currency,
        transactionId,
        pageType,
        includeUserData: allowPii,
        userData: allowPii ? { email: userEmail, phone: userPhone } : undefined,
      });
      if (ok || attempts >= 20) {
        if (ok) {
          firedRef.current = true;
        }
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [
    fire,
    marketingAllowed,
    config.quoteEnabled,
    value,
    currency,
    transactionId,
    pageType,
    allowPii,
    userEmail,
    userPhone,
  ]);

  return null;
}
