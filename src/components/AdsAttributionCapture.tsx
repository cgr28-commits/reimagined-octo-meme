"use client";

import { useEffect } from "react";
import { captureAdsAttributionFromLocation } from "@/lib/ads-attribution";

/** Captures Google Ads UTM / gclid params into sessionStorage on first paint. */
export default function AdsAttributionCapture() {
  useEffect(() => {
    captureAdsAttributionFromLocation();
  }, []);
  return null;
}
