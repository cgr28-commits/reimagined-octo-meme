"use client";

import { useEffect, useRef, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { getGoogleAdsConfig } from "@/lib/google-ads";
import {
  isGtagReady,
  trackRequestQuote,
  type AdsUserData,
} from "@/lib/google-ads-client";

type GoogleAdsRequestQuoteProps = {
  /** Fire request_quote once this becomes true (quote/enquiry successfully submitted). */
  fire: boolean;
  value?: number;
  currency?: string;
  transactionId?: string;
  userData?: AdsUserData;
};

/**
 * Fires the request_quote conversion after a successful quote request — not on form open.
 */
export default function GoogleAdsRequestQuote({
  fire,
  value,
  currency = "GBP",
  transactionId,
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

  useEffect(() => {
    if (
      !fire ||
      (!config.tagEnabled && !config.quoteEnabled) ||
      !marketingAllowed ||
      firedRef.current
    ) {
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!isGtagReady() && attempts < 20) {
        return;
      }
      const ok = trackRequestQuote({
        value,
        currency,
        transactionId,
        userData: { email: userEmail, phone: userPhone },
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
    config.tagEnabled,
    config.quoteEnabled,
    value,
    currency,
    transactionId,
    userEmail,
    userPhone,
  ]);

  return null;
}
