"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  readCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { getGoogleAdsConfig } from "@/lib/google-ads";
import {
  applyConsentDefault,
  contactClickKind,
  trackContactClick,
  updateGoogleConsent,
} from "@/lib/google-ads-client";

/**
 * Sitewide Google tag (gtag.js) with Consent Mode v2.
 * Loads on every page when the Google Ads ID is configured (code default or env).
 * Ads cookies stay denied until the visitor accepts measurement cookies.
 */
export default function GoogleAdsTag() {
  const config = getGoogleAdsConfig();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!config.tagEnabled) return;

    applyConsentDefault();
    const choice = readCookieConsent();
    if (choice === "accepted") {
      updateGoogleConsent(true);
    } else if (choice === "rejected") {
      updateGoogleConsent(false);
    }
    setReady(true);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentChoice>).detail;
      updateGoogleConsent(detail === "accepted");
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, [config.tagEnabled]);

  // Sitewide WhatsApp / phone tap tracking. Capture phase so it runs before
  // navigation to wa.me or the dialler, whichever component renders the link.
  useEffect(() => {
    if (!config.tagEnabled) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const kind = contactClickKind(anchor.getAttribute("href"));
      if (!kind) return;
      try {
        trackContactClick(kind, window.location.pathname);
      } catch {
        // Tracking must never block a customer from contacting us.
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [config.tagEnabled]);

  if (!config.tagEnabled || !ready) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.adsId)}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag-config" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          // Consent Mode: when ad cookies are declined, carry the ad click in internal links instead.
          gtag('set', 'url_passthrough', true);
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(config.adsId)}, { allow_enhanced_conversions: true });
        `}
      </Script>
    </>
  );
}
