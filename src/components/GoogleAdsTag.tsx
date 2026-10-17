"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_KEY,
  readMeasurementConsent,
} from "@/lib/cookie-consent";
import { containMeasurementExecution, stopMeasurementAndReload } from "@/lib/measurement-shutdown";
import { getGoogleAdsConfig } from "@/lib/google-ads";
import {
  applyConsentDefault,
  updateGoogleConsent,
} from "@/lib/google-ads-client";

/**
 * Sitewide Google tag (gtag.js) with Consent Mode v2.
 * Loads only after explicit advertising-measurement consent.
 * Ads cookies stay denied until the visitor accepts measurement cookies.
 */
export default function GoogleAdsTag() {
  const config = getGoogleAdsConfig();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!config.tagEnabled) return;

    applyConsentDefault();
    let previous = readMeasurementConsent();
    let started = false;
    let expiryTimer: number | undefined;
    let configuredPermissions = "";
    const sync = () => {
      const next = readMeasurementConsent();
      const reduced = Boolean(
        (started && !next?.advertising) ||
        (previous?.analytics && !next?.analytics),
      );
      if (reduced) {
        // Do not send a consent-update ping from the old loaded tag.
        stopMeasurementAndReload();
        return;
      }
      previous = next;
      if (next?.advertising) containMeasurementExecution();
      started ||= next?.advertising === true;
      const permissions = `${next?.advertising === true}/${next?.analytics === true}`;
      if (permissions !== configuredPermissions) {
        configuredPermissions = permissions;
        updateGoogleConsent(next?.advertising === true);
      }
      setReady(next?.advertising === true);
      window.clearTimeout(expiryTimer);
      if (next) expiryTimer = window.setTimeout(sync,
        Math.min(2_147_483_647, Math.max(1, Date.parse(next.expiresAt) - Date.now())));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_KEY || event.key === null) sync();
    };
    sync();
    window.addEventListener(COOKIE_CONSENT_EVENT, sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
      window.clearTimeout(expiryTimer);
    };
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
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(config.adsId)}, { allow_enhanced_conversions: false, allow_ad_personalization_signals: false });
        `}
      </Script>
    </>
  );
}
