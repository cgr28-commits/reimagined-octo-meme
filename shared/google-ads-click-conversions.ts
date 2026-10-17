import { advertisingConsent } from "./measurement-consent";
/**
 * Google Ads click conversion upload (ConversionUploadService.UploadClickConversions).
 * Used after SumUp PAID finalize — never from the browser.
 *
 * Docs: https://developers.google.com/google-ads/api/docs/conversions/upload-offline
 * REST: POST .../customers/{customerId}:uploadClickConversions
 */

import type { AdsAttribution } from "./ads-attribution";
import { sanitizeAdsAttribution } from "./ads-attribution";
import { UK_TIME_ZONE } from "./uk-time";

export const GOOGLE_ADS_API_VERSION = "v25";

export type GoogleAdsClickConversionEnv = {
  /** Enable only after validating the account/action type, counting and upload diagnostics. */
  GOOGLE_ADS_PAID_UPLOAD_VERIFIED?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  /** Explicit account ID, digits only; never a website AW tag identifier. */
  GOOGLE_ADS_CUSTOMER_ID?: string;
  /** Optional manager / MCC login customer id (no dashes). */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
  /** Explicit verified imported paid-booking conversion action ID. */
  GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID?: string;
};

export type PaidBookingAdsConversionStatus =
  | "sent"
  | "skipped_no_click_id"
  | "skipped_not_configured"
  | "skipped_duplicate"
  | "failed"
  | "skipped_no_consent"
  | "skipped_cancelled";

export type UploadPaidBookingClickConversionInput = {
  attribution?: AdsAttribution | null;
  orderId: string;
  conversionValue: number;
  currencyCode?: string;
  conversionTime?: Date;
};

export type UploadPaidBookingClickConversionResult = {
  status: PaidBookingAdsConversionStatus;
  orderId: string;
  clickIdType?: "gclid" | "gbraid" | "wbraid";
  error?: string;
  rawSummary?: string;
};

function trimSecret(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function isGoogleAdsClickConversionConfigured(
  env: GoogleAdsClickConversionEnv,
): boolean {
  return Boolean(
    env.GOOGLE_ADS_PAID_UPLOAD_VERIFIED === "true" &&
    trimSecret(env.GOOGLE_ADS_DEVELOPER_TOKEN) &&
    trimSecret(env.GOOGLE_ADS_CLIENT_ID) &&
    trimSecret(env.GOOGLE_ADS_CLIENT_SECRET) &&
    trimSecret(env.GOOGLE_ADS_REFRESH_TOKEN) &&
    resolveGoogleAdsCustomerId(env) &&
    resolvePaidBookingConversionActionId(env),
  );
}

export function resolveGoogleAdsCustomerId(
  env: GoogleAdsClickConversionEnv,
): string {
  const value = trimSecret(env.GOOGLE_ADS_CUSTOMER_ID);
  return /^\d{10}$/.test(value) ? value : "";
}

export function resolvePaidBookingConversionActionId(
  env: GoogleAdsClickConversionEnv,
): string {
  const value = trimSecret(env.GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID);
  return /^\d+$/.test(value) ? value : "";
}

/** Prefer gclid, then wbraid (iOS web), then gbraid — exactly one id per upload. */
export function pickAdsClickIdentifier(
  attribution: AdsAttribution | null | undefined,
): { type: "gclid" | "gbraid" | "wbraid"; value: string } | null {
  const clean = sanitizeAdsAttribution(attribution);
  if (!clean) return null;
  if (clean.gclid) return { type: "gclid", value: clean.gclid };
  if (clean.wbraid) return { type: "wbraid", value: clean.wbraid };
  if (clean.gbraid) return { type: "gbraid", value: clean.gbraid };
  return null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Google Ads requires `yyyy-mm-dd hh:mm:ss+|-hh:mm` with an explicit zone offset.
 * Format the instant in Europe/London wall clock + its offset at that moment.
 */
export function formatGoogleAdsConversionDateTime(
  instant = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((asIfUtc - instant.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(abs / 60);
  const offsetMins = abs % 60;

  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}${sign}${pad2(offsetHours)}:${pad2(offsetMins)}`;
}

export function digitsOnlyCustomerId(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function fetchGoogleAdsAccessToken(
  env: GoogleAdsClickConversionEnv,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: trimSecret(env.GOOGLE_ADS_CLIENT_ID),
    client_secret: trimSecret(env.GOOGLE_ADS_CLIENT_SECRET),
    refresh_token: trimSecret(env.GOOGLE_ADS_REFRESH_TOKEN),
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        `Google OAuth token exchange failed (${response.status})`,
    );
  }
  return payload.access_token;
}

function isDuplicateOrderFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("duplicate_order_id") ||
    lower.includes("duplicate order id") ||
    lower.includes("already exists")
  );
}

/**
 * Upload one Paid Booking click conversion. Safe to call on webhook retries —
 * callers must persist `googleAdsPaidConversionSentAt` after status === "sent"
 * (or skipped_duplicate).
 */
export async function uploadPaidBookingClickConversion(
  env: GoogleAdsClickConversionEnv,
  input: UploadPaidBookingClickConversionInput,
): Promise<UploadPaidBookingClickConversionResult> {
  const orderId = input.orderId.trim();
  if (!orderId) {
    return { status: "failed", orderId: "", error: "Missing order id" };
  }

  if (!isGoogleAdsClickConversionConfigured(env)) {
    return { status: "skipped_not_configured", orderId };
  }

  if (!Number.isFinite(input.conversionValue) || input.conversionValue <= 0) {
    return {
      status: "failed",
      orderId,
      error: "Paid Booking conversion requires a positive value",
    };
  }

  const consent = advertisingConsent(input.attribution?.consent);
  if (!consent) return { status: "skipped_no_consent", orderId };
  const clickId = input.attribution?.lastTouch && input.attribution.lastTouch.source !== "Google Ads"
    ? null : pickAdsClickIdentifier(input.attribution);
  if (!clickId) {
    return { status: "skipped_no_click_id", orderId };
  }

  const customerId = resolveGoogleAdsCustomerId(env);
  const actionId = resolvePaidBookingConversionActionId(env);
  const loginCustomerId = digitsOnlyCustomerId(
    trimSecret(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
  );
  const conversionAction = `customers/${customerId}/conversionActions/${actionId}`;
  const currencyCode = (input.currencyCode?.trim() || "GBP").toUpperCase();
  const conversionDateTime = formatGoogleAdsConversionDateTime(
    input.conversionTime ?? new Date(),
  );

  const clickConversion: Record<string, unknown> = {
    conversionAction,
    conversionDateTime,
    conversionValue: Math.round(input.conversionValue * 100) / 100,
    currencyCode,
    orderId,
    // Attribution was only stored after measurement consent on the site.
    // Click-conversion imports support ad_user_data; personalization is never enabled.
    consent: {
      adUserData: consent.advertising ? "GRANTED" : "DENIED",
    },
    [clickId.type]: clickId.value,
  };

  try {
    const accessToken = await fetchGoogleAdsAccessToken(env);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "developer-token": trimSecret(env.GOOGLE_ADS_DEVELOPER_TOKEN),
    };
    if (loginCustomerId) {
      headers["login-customer-id"] = loginCustomerId;
    }

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          conversions: [clickConversion],
          partialFailure: true,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      partialFailureError?: { message?: string; details?: unknown[] };
      results?: Array<{ orderId?: string; gclid?: string }>;
      error?: { message?: string; status?: string };
      message?: string;
    } | null;

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        `Google Ads upload failed (${response.status})`;
      if (isDuplicateOrderFailure(message)) {
        return {
          status: "skipped_duplicate",
          orderId,
          clickIdType: clickId.type,
          rawSummary: message,
        };
      }
      return {
        status: "failed",
        orderId,
        clickIdType: clickId.type,
        error: message,
      };
    }

    const partialMessage =
      payload?.partialFailureError?.message ||
      (typeof payload?.partialFailureError === "object"
        ? JSON.stringify(payload.partialFailureError)
        : "");
    if (partialMessage) {
      if (isDuplicateOrderFailure(partialMessage)) {
        return {
          status: "skipped_duplicate",
          orderId,
          clickIdType: clickId.type,
          rawSummary: partialMessage,
        };
      }
      return {
        status: "failed",
        orderId,
        clickIdType: clickId.type,
        error: partialMessage,
      };
    }

    if (!Array.isArray(payload?.results) || payload.results.length !== 1) {
      return { status: "failed", orderId, clickIdType: clickId.type, error: "Google Ads did not acknowledge the conversion" };
    }

    return {
      status: "sent",
      orderId,
      clickIdType: clickId.type,
      rawSummary: `uploaded ${clickId.type}`,
    };
  } catch (error) {
    return {
      status: "failed",
      orderId,
      clickIdType: clickId.type,
      error:
        error instanceof Error ? error.message : "Google Ads upload failed",
    };
  }
}
