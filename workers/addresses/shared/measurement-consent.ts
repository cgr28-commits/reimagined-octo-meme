/** Measurement permission is independent of operational booking/payment data. */
export const MEASUREMENT_POLICY_VERSION = "2026-10-17";
export const CONSENT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export type MeasurementConsent = {
  id: string;
  version: string;
  recordedAt: string;
  expiresAt: string;
  advertising: boolean;
  analytics: boolean;
  personalization: false;
};
export function sanitizeMeasurementConsent(
  value: unknown,
  now = Date.now(),
): MeasurementConsent | undefined {
  if (!value || typeof value !== "object") return;
  const c = value as MeasurementConsent;
  const at = Date.parse(c.recordedAt),
    expiry = Date.parse(c.expiresAt);
  if (
    !/^[a-f0-9-]{36}$/i.test(c.id || "") ||
    c.version !== MEASUREMENT_POLICY_VERSION ||
    !Number.isFinite(at) ||
    !Number.isFinite(expiry) ||
    at > now + 60_000 ||
    expiry <= now ||
    expiry <= at ||
    expiry - at > CONSENT_MAX_AGE_MS ||
    typeof c.advertising !== "boolean" ||
    typeof c.analytics !== "boolean" ||
    c.personalization !== false
  )
    return;
  return {
    id: c.id,
    version: c.version,
    recordedAt: c.recordedAt,
    expiresAt: c.expiresAt,
    advertising: c.advertising,
    analytics: c.analytics,
    personalization: false,
  };
}
export function advertisingConsent(
  value: unknown,
  now = Date.now(),
): MeasurementConsent | undefined {
  const c = sanitizeMeasurementConsent(value, now);
  return c?.advertising ? c : undefined;
}
