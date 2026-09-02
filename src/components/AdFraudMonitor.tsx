"use client";

/**
 * Sitewide passive Ad Fraud monitors.
 * Does not touch TrafficGuard, Google Ads tags, or AdsAttributionCapture.
 */

import { useEffect } from "react";
import {
  maybeRecordPaidAdVisit,
  recordAdFraudBehaviour,
} from "@/lib/ad-fraud-events";

export default function AdFraudMonitor() {
  useEffect(() => {
    maybeRecordPaidAdVisit();

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href") || "";
      if (
        href.includes("wa.me") ||
        href.includes("api.whatsapp.com") ||
        anchor.hasAttribute("data-matni-whatsapp-quick")
      ) {
        recordAdFraudBehaviour("whatsapp_clicked", { href: href.slice(0, 80) });
        return;
      }
      if (href.startsWith("tel:")) {
        recordAdFraudBehaviour("phone_clicked", { href: href.slice(0, 40) });
      }
    }

    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
