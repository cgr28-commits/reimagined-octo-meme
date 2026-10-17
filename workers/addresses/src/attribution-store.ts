import type { AdsAttribution } from "../shared/ads-attribution";
import { sanitizeAdsAttribution } from "../shared/ads-attribution";
import { eligibleAdvertisingConsent } from "./measurement-consent";
import { markMeasurementUnavailable, measurementUnavailable } from "./measurement-availability";
/** Expiring sidecar keeps marketing identifiers out of long-lived operational records. */
export async function storeAttribution(
  store: KVNamespace,
  key: string,
  value: AdsAttribution | undefined,
): Promise<void> {
  try {
    if (measurementUnavailable(store)) return;
    const c = await eligibleAdvertisingConsent(store, value?.consent);
    // Unknown availability is not withdrawal. Retain the original TTL/evidence,
    // without reading it for measurement or extending its lifetime.
    if (measurementUnavailable(store)) return;
    if (!c) {
      await store.delete(key);
      return;
    }
    const ttl = Math.floor((Date.parse(c.expiresAt) - Date.now()) / 1000);
    if (ttl < 60) {
      await store.delete(key);
      return;
    }
    await store.put(key, JSON.stringify(sanitizeAdsAttribution(value)), {
      expirationTtl: ttl,
    });
  } catch {
    markMeasurementUnavailable(store);
    /* Measurement storage must never fail a payment or notification. */
  }
}
export async function loadAttribution(
  store: KVNamespace,
  key: string,
): Promise<AdsAttribution | undefined> {
  try {
    if (measurementUnavailable(store)) return;
    const a = await store.get<AdsAttribution>(key, "json");
    if (!a || !(await eligibleAdvertisingConsent(store, a.consent))) return;
    return sanitizeAdsAttribution(a);
  } catch {
    markMeasurementUnavailable(store);
    return;
  }
}
