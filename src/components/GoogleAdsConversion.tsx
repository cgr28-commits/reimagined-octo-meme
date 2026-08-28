"use client";

import { useEffect, useRef, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  hasMarketingCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import {
  trackPurchase,
  type AdsUserData,
} from "@/lib/google-ads-client";

type GoogleAdsConversionProps = {
  /** Fire purchase once this becomes true (paid booking confirmed by the server). */
  fire: boolean;
  value?: number;
  currency?: string;
  /** Unique booking / payment reference — required to prevent refresh double-counting. */
  transactionId?: string;
  bookingReference?: string;
  /** Optional enhanced-conversion fields (hashed by gtag when consented). */
  userData?: AdsUserData;
};

/**
 * Fires the labelled Google Ads Paid Booking conversion only after the Worker
 * returns a genuine SumUp PAID confirmation. The unique transaction ID and
 * local-storage guard make refreshes idempotent.
 */
export default function GoogleAdsConversion({
  fire,
  value,
  currency = "GBP",
  transactionId,
  bookingReference,
  userData,
}: GoogleAdsConversionProps) {
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
      !marketingAllowed ||
      firedRef.current ||
      !transactionId?.trim()
    ) {
      return;
    }

    const ok = trackPurchase({
      value,
      currency,
      transactionId,
      bookingReference,
      includeUserData: true,
      userData: { email: userEmail, phone: userPhone },
    });
    if (ok) firedRef.current = true;
  }, [
    fire,
    marketingAllowed,
    value,
    currency,
    transactionId,
    bookingReference,
    userEmail,
    userPhone,
  ]);

  return null;
}
