/**
 * Paid Booking conversion upload after SumUp PAID finalize — never from the browser.
 *
 * Current official path (2026-09): Data Manager API `events:ingest`.
 * Docs:
 * - https://developers.google.com/data-manager/api/devguides/events/send-events
 * - https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade/field-mappings
 *
 * Fallback: Google Ads API ConversionUploadService.UploadClickConversions (v25).
 * Restricted since 2026-06-15 for Cloud projects / tokens with no prior offline-upload
 * activity in the allowlist window — those requests return
 * CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE.
 * Docs:
 * - https://developers.google.com/google-ads/api/docs/conversions/upload-offline
 * - https://developers.google.com/google-ads/api/docs/deprecations
 *
 * The Ads UI label "Website (Import from clicks)" is the UPLOAD_CLICKS action type.
 * A Data Manager "associated connections" warning is a UI-connector signal and is
 * not itself proof that API ingest is broken.
 */

import type { AdsAttribution } from "./ads-attribution";
import { sanitizeAdsAttribution } from "./ads-attribution";
import { UK_TIME_ZONE } from "./uk-time";

export const GOOGLE_ADS_API_VERSION = "v25";
export const DATA_MANAGER_EVENTS_INGEST_URL =
  "https://datamanager.googleapis.com/v1/events:ingest";
export const GOOGLE_ADS_OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords";
export const DATA_MANAGER_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/datamanager";

/**
 * Google Ads *account* customer ID (digits only, no dashes).
 * This is NOT the website tag ID `AW-18303631278` — that tag is for gtag/send_to only.
 */
export const DEFAULT_GOOGLE_ADS_CUSTOMER_ID = "4955115517";

/**
 * Numeric conversion action id stored as the code default for account 495-511-5517.
 * This is not independently verified against the live Ads UI in this environment.
 * Confirm it matches PAID BOOKING-SERVER (type UPLOAD_CLICKS, status ENABLED)
 * before treating production uploads as correctly targeted.
 */
export const DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID = "7734768680";

const STALE_GOOGLE_ADS_CUSTOMER_IDS = new Set(["18303631278", "10303631278"]);
const STALE_PAID_BOOKING_ACTION_IDS = new Set(["77347686808", "7733724411"]);

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_UPLOAD_ATTEMPTS = 3;

export type GoogleAdsClickConversionEnv = {
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  /**
   * Numeric Google Ads customer id without dashes (default {@link DEFAULT_GOOGLE_ADS_CUSTOMER_ID}).
   * Do not set this to the AW- tag number (18303631278).
   */
  GOOGLE_ADS_CUSTOMER_ID?: string;
  /** Optional manager / MCC login customer id (no dashes). */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
  /**
   * Numeric Paid Booking conversion action id
   * (default {@link DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID}).
   */
  GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID?: string;
};

export type PaidBookingAdsConversionStatus =
  | "pending"
  | "accepted"
  | "sent"
  | "skipped_no_click_id"
  | "skipped_not_configured"
  | "skipped_duplicate"
  | "failed";

export type PaidBookingAdsUploadChannel = "data_manager" | "ads_api";

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
  channel?: PaidBookingAdsUploadChannel;
  requestId?: string;
};

export type PaidBookingAdsRecoveryClass =
  | "already_uploaded"
  | "eligible"
  | "ineligible";

export type PaidBookingAdsRecoveryRecord = {
  paymentReference?: string;
  googleAdsPaidConversionSentAt?: string;
  googleAdsPaidConversionStatus?: PaidBookingAdsConversionStatus;
  attribution?: AdsAttribution | null;
  amount?: number;
  originalAmount?: number;
  createdAt?: string;
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
  isAmendmentTopUp?: boolean;
};

export type PaidBookingAdsRecoveryClassification = {
  class: PaidBookingAdsRecoveryClass;
  reason: string;
  hasClickId: boolean;
  hasPaymentTimestamp: boolean;
};

function trimSecret(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** OAuth client/secret/refresh are required. Developer token is optional after the 2026-09-09 sunset. */
export function isGoogleAdsClickConversionConfigured(
  env: GoogleAdsClickConversionEnv,
): boolean {
  return Boolean(
    trimSecret(env.GOOGLE_ADS_CLIENT_ID) &&
      trimSecret(env.GOOGLE_ADS_CLIENT_SECRET) &&
      trimSecret(env.GOOGLE_ADS_REFRESH_TOKEN),
  );
}

export function resolveGoogleAdsCustomerId(env: GoogleAdsClickConversionEnv): string {
  const candidate = digitsOnlyCustomerId(
    trimSecret(env.GOOGLE_ADS_CUSTOMER_ID) || DEFAULT_GOOGLE_ADS_CUSTOMER_ID,
  );
  return STALE_GOOGLE_ADS_CUSTOMER_IDS.has(candidate)
    ? DEFAULT_GOOGLE_ADS_CUSTOMER_ID
    : candidate;
}

export function resolvePaidBookingConversionActionId(
  env: GoogleAdsClickConversionEnv,
): string {
  const candidate = digitsOnlyCustomerId(
    trimSecret(env.GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID) ||
      DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID,
  );
  return STALE_PAID_BOOKING_ACTION_IDS.has(candidate)
    ? DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID
    : candidate;
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
export function formatGoogleAdsConversionDateTime(instant = new Date()): string {
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

/** Data Manager `eventTimestamp` uses RFC 3339, not the Ads API datetime string. */
export function formatDataManagerEventTimestamp(instant = new Date()): string {
  return instant.toISOString();
}

export function digitsOnlyCustomerId(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isRetryableGoogleAdsHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

export function isAdsApiOfflineUploadRestricted(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("customer_not_allowlisted_for_this_feature") ||
    lower.includes("not allowlisted") ||
    lower.includes("not allow-listed")
  );
}

export function isDataManagerScopeFailure(message: string): boolean {
  const lower = message.toLowerCase();
  const insufficientScope =
    lower.includes("insufficient") && lower.includes("scope");
  const dataManagerDisabled =
    lower.includes("datamanager") &&
    (lower.includes("permission") ||
      lower.includes("disabled") ||
      lower.includes("has not been used"));
  return insufficientScope || lower.includes("access_denied") || dataManagerDisabled;
}

function isDuplicateOrderFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("duplicate_order_id") ||
    lower.includes("duplicate order id") ||
    lower.includes("duplicate_transaction_id") ||
    lower.includes("duplicate transaction") ||
    lower.includes("already exists")
  );
}

type GoogleAdsFailureLike = {
  message?: string;
  details?: unknown[];
  errors?: Array<{ message?: string; errorCode?: Record<string, string> }>;
};

export function extractGoogleAdsPartialFailureMessage(
  partialFailureError: GoogleAdsFailureLike | null | undefined,
): string {
  if (!partialFailureError || typeof partialFailureError !== "object") return "";
  const fromDetails: string[] = [];
  for (const detail of partialFailureError.details ?? []) {
    if (!detail || typeof detail !== "object") continue;
    const packed = detail as {
      errors?: Array<{ message?: string; errorCode?: Record<string, unknown> }>;
      message?: string;
    };
    if (Array.isArray(packed.errors)) {
      for (const error of packed.errors) {
        const code = error.errorCode
          ? Object.values(error.errorCode)
              .filter((value) => typeof value === "string")
              .join("/")
          : "";
        const piece = [code, error.message].filter(Boolean).join(": ");
        if (piece) fromDetails.push(piece);
      }
    }
    if (typeof packed.message === "string" && packed.message.trim()) {
      fromDetails.push(packed.message.trim());
    }
  }
  if (fromDetails.length > 0) return fromDetails.join("; ").slice(0, 500);
  if (partialFailureError.message?.trim()) return partialFailureError.message.trim();
  if (Array.isArray(partialFailureError.errors) && partialFailureError.errors.length > 0) {
    return partialFailureError.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ")
      .slice(0, 500);
  }
  return "";
}

export function adsApiUploadHasMatchingResult(
  results: Array<{ orderId?: string; gclid?: string }> | undefined,
  orderId: string,
): boolean {
  if (!Array.isArray(results) || results.length === 0) return false;
  return results.some((result) => {
    if (!result || typeof result !== "object") return false;
    const resultOrderId = typeof result.orderId === "string" ? result.orderId.trim() : "";
    const hasClick = typeof result.gclid === "string" && result.gclid.trim().length > 0;
    return resultOrderId === orderId || (hasClick && !resultOrderId);
  });
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[redacted-refresh]")
    .slice(0, 500);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGoogleAdsAccessToken(env: GoogleAdsClickConversionEnv): Promise<string> {
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

function extractHttpErrorMessage(
  payload: {
    error?: { message?: string; status?: string; details?: unknown[] };
    message?: string;
  } | null,
  status: number,
): string {
  const details = Array.isArray(payload?.error?.details)
    ? payload.error.details
        .map((detail) => {
          if (!detail || typeof detail !== "object") return "";
          const item = detail as {
            reason?: string;
            description?: string;
            fieldViolations?: Array<{ description?: string; reason?: string }>;
          };
          const violations = (item.fieldViolations ?? [])
            .map((violation) => violation.reason || violation.description)
            .filter(Boolean)
            .join("; ");
          return [item.reason, item.description, violations].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join("; ")
    : "";
  return redactErrorMessage(
    [payload?.error?.status, payload?.error?.message, payload?.message, details]
      .filter(Boolean)
      .join(" — ") || `Upload failed (${status})`,
  );
}

export function classifyPaidBookingAdsRecovery(
  record: PaidBookingAdsRecoveryRecord,
): PaidBookingAdsRecoveryClassification {
  const clickId = pickAdsClickIdentifier(record.attribution);
  const createdAtMs = record.createdAt ? Date.parse(record.createdAt) : NaN;
  const hasPaymentTimestamp = Number.isFinite(createdAtMs);
  const amount =
    typeof record.originalAmount === "number" && record.originalAmount > 0
      ? record.originalAmount
      : typeof record.amount === "number"
        ? record.amount
        : 0;
  const status = record.googleAdsPaidConversionStatus;

  if (record.isRefundTest || record.isAmendmentTestFixture || record.isAmendmentTopUp) {
    return {
      class: "ineligible",
      reason: "refund_or_amendment_not_a_new_paid_booking",
      hasClickId: Boolean(clickId),
      hasPaymentTimestamp,
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      class: "ineligible",
      reason: "invalid_or_missing_paid_amount",
      hasClickId: Boolean(clickId),
      hasPaymentTimestamp,
    };
  }
  if (!hasPaymentTimestamp) {
    return {
      class: "ineligible",
      reason: "missing_genuine_payment_timestamp",
      hasClickId: Boolean(clickId),
      hasPaymentTimestamp,
    };
  }
  if (
    record.googleAdsPaidConversionSentAt ||
    status === "sent" ||
    status === "accepted" ||
    status === "skipped_duplicate"
  ) {
    return {
      class: "already_uploaded",
      reason: status === "skipped_duplicate" ? "duplicate_order_already_accepted" : "already_accepted",
      hasClickId: Boolean(clickId),
      hasPaymentTimestamp,
    };
  }
  if (!clickId) {
    return {
      class: "ineligible",
      reason: "missing_click_id_or_marketing_consent",
      hasClickId: false,
      hasPaymentTimestamp,
    };
  }
  return {
    class: "eligible",
    reason:
      status === "pending"
        ? "retryable_pending_upload"
        : status === "failed"
          ? "previous_upload_failed"
          : status === "skipped_not_configured"
            ? "credentials_were_missing"
            : "never_uploaded",
    hasClickId: true,
    hasPaymentTimestamp,
  };
}

export function summarizePaidBookingAdsRecovery(
  records: PaidBookingAdsRecoveryRecord[],
): {
  scanned: number;
  eligible: number;
  alreadyUploaded: number;
  ineligible: number;
  classifications: PaidBookingAdsRecoveryClassification[];
} {
  const classifications = records.map(classifyPaidBookingAdsRecovery);
  return {
    scanned: records.length,
    eligible: classifications.filter((item) => item.class === "eligible").length,
    alreadyUploaded: classifications.filter((item) => item.class === "already_uploaded").length,
    ineligible: classifications.filter((item) => item.class === "ineligible").length,
    classifications,
  };
}

type PreparedUpload = {
  orderId: string;
  clickId: { type: "gclid" | "gbraid" | "wbraid"; value: string };
  customerId: string;
  actionId: string;
  loginCustomerId: string;
  currencyCode: string;
  conversionValue: number;
  conversionTime: Date;
};

function prepareUpload(
  env: GoogleAdsClickConversionEnv,
  input: UploadPaidBookingClickConversionInput,
): UploadPaidBookingClickConversionResult | { ok: true; prepared: PreparedUpload } {
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

  const clickId = pickAdsClickIdentifier(input.attribution);
  if (!clickId) {
    return { status: "skipped_no_click_id", orderId };
  }

  return {
    ok: true,
    prepared: {
      orderId,
      clickId,
      customerId: resolveGoogleAdsCustomerId(env),
      actionId: resolvePaidBookingConversionActionId(env),
      loginCustomerId: digitsOnlyCustomerId(trimSecret(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)),
      currencyCode: (input.currencyCode?.trim() || "GBP").toUpperCase(),
      conversionValue: Math.round(input.conversionValue * 100) / 100,
      conversionTime: input.conversionTime ?? new Date(),
    },
  };
}

async function postWithRetry(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; payload: Record<string, unknown> | null }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (isRetryableGoogleAdsHttpStatus(response.status) && attempt < MAX_UPLOAD_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
      return { response, payload };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Upload request failed");
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
    }
  }
  throw lastError ?? new Error("Upload request failed");
}

async function ingestDataManagerPaidBooking(
  env: GoogleAdsClickConversionEnv,
  prepared: PreparedUpload,
): Promise<UploadPaidBookingClickConversionResult> {
  const accessToken = await fetchGoogleAdsAccessToken(env);
  const destination: Record<string, unknown> = {
    operatingAccount: {
      accountType: "GOOGLE_ADS",
      accountId: prepared.customerId,
    },
    productDestinationId: prepared.actionId,
  };
  if (prepared.loginCustomerId) {
    destination.loginAccount = {
      accountType: "GOOGLE_ADS",
      accountId: prepared.loginCustomerId,
    };
  }

  const body = {
    destinations: [destination],
    encoding: "HEX",
    consent: { adUserData: "CONSENT_GRANTED" },
    events: [
      {
        eventTimestamp: formatDataManagerEventTimestamp(prepared.conversionTime),
        transactionId: prepared.orderId,
        eventSource: "WEB",
        conversionValue: prepared.conversionValue,
        currency: prepared.currencyCode,
        consent: { adUserData: "CONSENT_GRANTED" },
        adIdentifiers: { [prepared.clickId.type]: prepared.clickId.value },
      },
    ],
  };

  const { response, payload } = await postWithRetry(DATA_MANAGER_EVENTS_INGEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const requestId =
    typeof payload?.requestId === "string" && payload.requestId.trim()
      ? payload.requestId.trim()
      : undefined;
  const message = extractHttpErrorMessage(
    payload as {
      error?: { message?: string; status?: string; details?: unknown[] };
      message?: string;
    } | null,
    response.status,
  );

  if (isRetryableGoogleAdsHttpStatus(response.status)) {
    return {
      status: "pending",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "data_manager",
      error: message,
    };
  }

  if (!response.ok) {
    if (isDuplicateOrderFailure(message)) {
      return {
        status: "skipped_duplicate",
        orderId: prepared.orderId,
        clickIdType: prepared.clickId.type,
        channel: "data_manager",
        rawSummary: message,
      };
    }
    return {
      status: "failed",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "data_manager",
      error: message,
    };
  }

  if (!requestId) {
    return {
      status: "failed",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "data_manager",
      error: "Data Manager accepted the HTTP request but returned no requestId",
    };
  }

  return {
    status: "accepted",
    orderId: prepared.orderId,
    clickIdType: prepared.clickId.type,
    channel: "data_manager",
    requestId,
    rawSummary: `data_manager accepted ${prepared.clickId.type}`,
  };
}

async function uploadAdsApiClickConversion(
  env: GoogleAdsClickConversionEnv,
  prepared: PreparedUpload,
): Promise<UploadPaidBookingClickConversionResult> {
  const accessToken = await fetchGoogleAdsAccessToken(env);
  const conversionAction = `customers/${prepared.customerId}/conversionActions/${prepared.actionId}`;
  const clickConversion: Record<string, unknown> = {
    conversionAction,
    conversionDateTime: formatGoogleAdsConversionDateTime(prepared.conversionTime),
    conversionValue: prepared.conversionValue,
    currencyCode: prepared.currencyCode,
    orderId: prepared.orderId,
    conversionEnvironment: "WEB",
    consent: { adUserData: "GRANTED" },
    [prepared.clickId.type]: prepared.clickId.value,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const developerToken = trimSecret(env.GOOGLE_ADS_DEVELOPER_TOKEN);
  if (developerToken) {
    headers["developer-token"] = developerToken;
  }
  if (prepared.loginCustomerId) {
    headers["login-customer-id"] = prepared.loginCustomerId;
  }

  const { response, payload } = await postWithRetry(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${prepared.customerId}:uploadClickConversions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerId: prepared.customerId,
        conversions: [clickConversion],
        partialFailure: true,
      }),
    },
  );

  const typed = payload as {
    partialFailureError?: GoogleAdsFailureLike;
    results?: Array<{ orderId?: string; gclid?: string }>;
    error?: { message?: string; status?: string; details?: unknown[] };
    message?: string;
  } | null;
  const message = extractHttpErrorMessage(typed, response.status);

  if (isRetryableGoogleAdsHttpStatus(response.status)) {
    return {
      status: "pending",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "ads_api",
      error: message,
    };
  }

  if (!response.ok) {
    if (isDuplicateOrderFailure(message)) {
      return {
        status: "skipped_duplicate",
        orderId: prepared.orderId,
        clickIdType: prepared.clickId.type,
        channel: "ads_api",
        rawSummary: message,
      };
    }
    return {
      status: "failed",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "ads_api",
      error: message,
    };
  }

  const partialMessage = extractGoogleAdsPartialFailureMessage(typed?.partialFailureError);
  if (partialMessage) {
    if (isDuplicateOrderFailure(partialMessage)) {
      return {
        status: "skipped_duplicate",
        orderId: prepared.orderId,
        clickIdType: prepared.clickId.type,
        channel: "ads_api",
        rawSummary: partialMessage,
      };
    }
    return {
      status: "failed",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "ads_api",
      error: redactErrorMessage(partialMessage),
    };
  }

  if (!adsApiUploadHasMatchingResult(typed?.results, prepared.orderId)) {
    return {
      status: "failed",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      channel: "ads_api",
      error:
        "Google Ads accepted the HTTP request but returned no matching conversion result",
    };
  }

  return {
    status: "sent",
    orderId: prepared.orderId,
    clickIdType: prepared.clickId.type,
    channel: "ads_api",
    rawSummary: `uploaded ${prepared.clickId.type}`,
  };
}

/**
 * Upload one Paid Booking conversion. Safe to call on webhook retries —
 * callers must persist `googleAdsPaidConversionSentAt` after status === "sent"
 * or "accepted" (or skipped_duplicate).
 *
 * Prefers Data Manager ingest. Falls back to Ads API UploadClickConversions only
 * when Data Manager rejects the request for scope / API-enablement reasons.
 */
export async function uploadPaidBookingClickConversion(
  env: GoogleAdsClickConversionEnv,
  input: UploadPaidBookingClickConversionInput,
): Promise<UploadPaidBookingClickConversionResult> {
  const preparedOrSkip = prepareUpload(env, input);
  if (!("ok" in preparedOrSkip)) return preparedOrSkip;

  const { prepared } = preparedOrSkip;
  try {
    const dataManager = await ingestDataManagerPaidBooking(env, prepared);
    if (
      dataManager.status === "accepted" ||
      dataManager.status === "skipped_duplicate" ||
      dataManager.status === "pending"
    ) {
      return dataManager;
    }

    const shouldFallBackToAdsApi =
      Boolean(dataManager.error) && isDataManagerScopeFailure(dataManager.error ?? "");
    if (!shouldFallBackToAdsApi) {
      return dataManager;
    }

    const adsApi = await uploadAdsApiClickConversion(env, prepared);
    if (
      adsApi.status === "failed" &&
      adsApi.error &&
      isAdsApiOfflineUploadRestricted(adsApi.error)
    ) {
      return {
        ...adsApi,
        error: redactErrorMessage(
          `${adsApi.error} — Ads API offline uploads are restricted for this Cloud project; use Data Manager API with the datamanager OAuth scope`,
        ),
      };
    }
    return adsApi;
  } catch (error) {
    return {
      status: "pending",
      orderId: prepared.orderId,
      clickIdType: prepared.clickId.type,
      error: redactErrorMessage(
        error instanceof Error ? error.message : "Google conversion upload failed",
      ),
    };
  }
}
