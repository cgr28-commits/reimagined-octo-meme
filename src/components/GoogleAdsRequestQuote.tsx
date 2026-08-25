"use client";

import { useEffect, useRef, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import type { AdsQuotePageType } from "@/lib/google-ads";
import {
  trackRequestQuoteConversion,
  type AdsUserData,
} from "@/lib/google-ads-client";

type GoogleAdsRequestQuoteProps = {
  /**
   * Fire quote_generated / Request quote conversion once this becomes true —
   * only after the fixed-price result is successfully calculated and displayed.
   */
  fire: boolean;
  /** Required — conversion is skipped without a positive numeric quote amount. */
  value?: number;
  currency?: string;
  /** Required — unique quote / booking reference for deduplication. */
  transactionId?: string;
  pageType?: AdsQuotePageType;
  airport?: string;
  journeyType?: string;
  passengers?: number;
  returnJourney?: boolean;
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
  airport,
  journeyType,
  passengers,
  returnJourney,
  includeUserData = false,
  userData,
}: GoogleAdsRequestQuoteProps) {
  const lastFiredTransactionIdRef = useRef("");
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
    if (!fire || !marketingAllowed) {
      return;
    }

    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return;
    }
    if (!transactionId?.trim()) {
      return;
    }

    const normalizedId = transactionId.trim();
    if (lastFiredTransactionIdRef.current === normalizedId) return;
    const ok = trackRequestQuoteConversion({
      value,
      currency,
      transactionId: normalizedId,
      pageType,
      airport,
      journeyType,
      passengers,
      returnJourney,
      includeUserData: allowPii,
      userData: allowPii ? { email: userEmail, phone: userPhone } : undefined,
    });
    if (ok) lastFiredTransactionIdRef.current = normalizedId;
  }, [
    fire,
    marketingAllowed,
    value,
    currency,
    transactionId,
    pageType,
    airport,
    journeyType,
    passengers,
    returnJourney,
    allowPii,
    userEmail,
    userPhone,
  ]);

  return null;
}
