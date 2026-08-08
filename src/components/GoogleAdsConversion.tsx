"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { getGoogleAdsConfig } from "@/lib/google-ads";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type GoogleAdsConversionProps = {
  /** Fire the conversion event once this becomes true. */
  fire: boolean;
  value?: number;
  currency?: string;
  transactionId?: string;
};

function fireConversionEvent(options: {
  sendTo: string;
  value?: number;
  currency: string;
  transactionId?: string;
}): boolean {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }

  const payload: Record<string, unknown> = {
    send_to: options.sendTo,
    currency: options.currency,
  };
  if (typeof options.value === "number" && Number.isFinite(options.value)) {
    payload.value = options.value;
  }
  if (options.transactionId?.trim()) {
    payload.transaction_id = options.transactionId.trim();
  }

  window.gtag("event", "conversion", payload);
  return true;
}

/**
 * Loads gtag when Google Ads secrets are configured, and fires a purchase
 * conversion once after a successful paid booking.
 */
export default function GoogleAdsConversion({
  fire,
  value,
  currency = "GBP",
  transactionId,
}: GoogleAdsConversionProps) {
  const config = getGoogleAdsConfig();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!fire || !config.enabled || firedRef.current) {
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const ok = fireConversionEvent({
        sendTo: config.sendTo,
        value,
        currency,
        transactionId,
      });
      if (ok || attempts >= 20) {
        if (ok) {
          firedRef.current = true;
        }
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [fire, config.enabled, config.sendTo, value, currency, transactionId]);

  if (!config.enabled) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.adsId)}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(config.adsId)});
        `}
      </Script>
    </>
  );
}
