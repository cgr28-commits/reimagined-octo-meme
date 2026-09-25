/**
 * After SumUp PAID finalize: upload Paid Booking to Google Ads once per payment.
 * Never throws — payment confirmation must not fail because Ads is unavailable.
 */

import type { AdsAttribution } from "../shared/ads-attribution";
import {
  classifyPaidBookingAdsRecovery,
  isGoogleAdsClickConversionConfigured,
  pickAdsClickIdentifier,
  summarizePaidBookingAdsRecovery,
  uploadPaidBookingClickConversion,
  type GoogleAdsClickConversionEnv,
  type PaidBookingAdsConversionStatus,
  type PaidBookingAdsRecoveryClassification,
  type PaidBookingAdsUploadChannel,
} from "../shared/google-ads-click-conversions";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  getPaidBookingRecord,
  listRecentPaidBookings,
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";

export type PaidBookingAdsConversionEnv = GoogleAdsClickConversionEnv & {
  TRACKING_STORE?: KVNamespace;
};

const TERMINAL_SUCCESS_STATUSES = new Set<PaidBookingAdsConversionStatus>([
  "sent",
  "accepted",
  "skipped_duplicate",
]);

/** Terminal unless a later retry now has a genuine click identifier. */
export function shouldSkipPaidBookingAdsUpload(
  record: PaidBookingRecord,
  nextAttribution?: AdsAttribution | null,
): boolean {
  if (record.googleAdsPaidConversionSentAt) return true;
  const status = record.googleAdsPaidConversionStatus;
  if (status && TERMINAL_SUCCESS_STATUSES.has(status)) return true;
  if (status === "skipped_no_click_id") {
    return !pickAdsClickIdentifier(nextAttribution ?? record.attribution);
  }
  return false;
}

async function persistConversionOutcome(
  store: KVNamespace,
  paymentReference: string,
  outcome: {
    status: PaidBookingAdsConversionStatus;
    orderId: string;
    clickIdType?: "gclid" | "gbraid" | "wbraid";
    error?: string;
    channel?: PaidBookingAdsUploadChannel;
    requestId?: string;
  },
): Promise<void> {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record) return;
  if (
    shouldSkipPaidBookingAdsUpload(record) &&
    outcome.status !== "sent" &&
    outcome.status !== "accepted"
  ) {
    return;
  }

  const next: PaidBookingRecord = {
    ...record,
    googleAdsPaidConversionOrderId: outcome.orderId || record.googleAdsPaidConversionOrderId,
    googleAdsPaidConversionStatus: outcome.status,
    ...(outcome.clickIdType
      ? { googleAdsPaidConversionClickIdType: outcome.clickIdType }
      : {}),
    ...(outcome.channel ? { googleAdsPaidConversionChannel: outcome.channel } : {}),
    ...(outcome.requestId ? { googleAdsPaidConversionRequestId: outcome.requestId } : {}),
  };

  if (TERMINAL_SUCCESS_STATUSES.has(outcome.status)) {
    next.googleAdsPaidConversionSentAt =
      record.googleAdsPaidConversionSentAt || new Date().toISOString();
    delete next.googleAdsPaidConversionLastError;
  } else if (outcome.status === "failed" || outcome.status === "pending") {
    next.googleAdsPaidConversionLastError = outcome.error?.slice(0, 500);
  } else if (outcome.status === "skipped_no_click_id") {
    delete next.googleAdsPaidConversionLastError;
  } else if (outcome.status === "skipped_not_configured") {
    // Keep status visible but allow retry once Worker secrets are added.
    delete next.googleAdsPaidConversionLastError;
  }

  await savePaidBookingRecord(store, next);
}

/**
 * Upload Paid Booking click conversion if credentials + click id are present.
 * Idempotent across SumUp webhook retries and browser confirm calls.
 */
export async function maybeUploadPaidBookingAdsConversion(input: {
  env: PaidBookingAdsConversionEnv;
  paymentReference: string;
  amount: number;
  currency?: string;
  attribution?: AdsAttribution | null;
  /** Owner refund smoke tests must never count as Paid Booking. */
  isRefundTest?: boolean;
  /** Amendment top-ups are not a new Paid Booking conversion. */
  isAmendmentTopUp?: boolean;
  /** Preserve the original paid-booking timestamp on delayed/retry uploads. */
  conversionTime?: Date;
}): Promise<void> {
  const paymentReference = input.paymentReference.trim();
  if (!paymentReference) return;
  if (input.isRefundTest || input.isAmendmentTopUp) return;

  if (!paidBookingStoreConfigured(input.env.TRACKING_STORE)) {
    return;
  }

  const store = input.env.TRACKING_STORE;
  const existing = await getPaidBookingRecord(store, paymentReference);
  const attribution = input.attribution ?? existing?.attribution ?? null;
  if (existing && shouldSkipPaidBookingAdsUpload(existing, attribution)) {
    return;
  }

  if (!isGoogleAdsClickConversionConfigured(input.env)) {
    if (existing) {
      await persistConversionOutcome(store, paymentReference, {
        status: "skipped_not_configured",
        orderId: paymentReference,
      });
    }
    console.info(
      "Google Ads Paid Booking upload skipped — Worker secrets not configured",
      { paymentReference },
    );
    return;
  }

  const amount =
    Number.isFinite(input.amount) && input.amount > 0
      ? input.amount
      : typeof existing?.amount === "number"
        ? existing.amount
        : 0;
  const currency = input.currency || existing?.currency || "GBP";

  const result = await uploadPaidBookingClickConversion(input.env, {
    attribution,
    orderId: paymentReference,
    conversionValue: amount,
    currencyCode: currency,
    conversionTime:
      input.conversionTime ??
      (existing?.createdAt && !Number.isNaN(Date.parse(existing.createdAt))
        ? new Date(existing.createdAt)
        : undefined),
  });

  await persistConversionOutcome(store, paymentReference, {
    status: result.status,
    orderId: result.orderId || paymentReference,
    clickIdType: result.clickIdType,
    error: result.error,
    channel: result.channel,
    requestId: result.requestId,
  });

  if (result.status === "failed") {
    console.error("Google Ads Paid Booking upload failed", {
      paymentReference,
      status: result.status,
      channel: result.channel,
      error: result.error,
    });
  } else if (result.status === "pending") {
    console.warn("Google Ads Paid Booking upload pending", {
      paymentReference,
      channel: result.channel,
      error: result.error,
    });
  } else {
    console.info("Google Ads Paid Booking upload", {
      paymentReference,
      status: result.status,
      channel: result.channel,
      clickIdType: result.clickIdType,
    });
  }
}

export type PaidBookingAdsRetryResult = {
  scanned: number;
  eligible: number;
  attempted: number;
  errors: number;
};

/**
 * Hourly recovery for recent uploads that failed, stayed pending, or ran
 * before credentials were configured. Historical never-attempted records
 * are not uploaded automatically. Terminal statuses are never retried.
 * The original booking reference/timestamp are retained for Google
 * order-id dedupe and attribution.
 */
export async function retryRecentPaidBookingAdsConversions(
  env: PaidBookingAdsConversionEnv,
): Promise<PaidBookingAdsRetryResult> {
  const result: PaidBookingAdsRetryResult = {
    scanned: 0,
    eligible: 0,
    attempted: 0,
    errors: 0,
  };
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return result;
  }

  const records = await listRecentPaidBookings(env.TRACKING_STORE, {
    days: 30,
    limit: 50,
  });
  result.scanned = records.length;
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const record of records) {
    if (record.isRefundTest || record.isAmendmentTestFixture) {
      continue;
    }
    const createdAt = new Date(record.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() < cutoffMs) {
      continue;
    }
    const status = record.googleAdsPaidConversionStatus;
    const retryable =
      status === "failed" ||
      status === "pending" ||
      status === "skipped_not_configured" ||
      (status === "skipped_no_click_id" && Boolean(pickAdsClickIdentifier(record.attribution)));
    if (!retryable) {
      continue;
    }

    result.eligible += 1;
    try {
      await maybeUploadPaidBookingAdsConversion({
        env,
        paymentReference: record.paymentReference,
        amount:
          typeof record.originalAmount === "number" && record.originalAmount > 0
            ? record.originalAmount
            : record.amount,
        currency: record.currency,
        attribution: record.attribution,
        conversionTime: createdAt,
      });
      result.attempted += 1;
    } catch (error) {
      result.errors += 1;
      console.error("Google Ads Paid Booking retry failed", {
        paymentReference: record.paymentReference,
        error: error instanceof Error ? error.message : "Unknown retry error",
      });
    }
  }

  return result;
}

/**
 * Dry-run only. Classifies recent paid bookings for historical recovery.
 * Never uploads and never changes payment dates.
 */
export async function classifyRecentPaidBookingAdsRecovery(
  env: PaidBookingAdsConversionEnv,
): Promise<{
  scanned: number;
  eligible: number;
  alreadyUploaded: number;
  ineligible: number;
  reasons: Record<string, number>;
  samples: Array<{
    class: PaidBookingAdsRecoveryClassification["class"];
    reason: string;
    hasClickId: boolean;
    hasPaymentTimestamp: boolean;
  }>;
}> {
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return {
      scanned: 0,
      eligible: 0,
      alreadyUploaded: 0,
      ineligible: 0,
      reasons: {},
      samples: [],
    };
  }

  const records = await listRecentPaidBookings(env.TRACKING_STORE, {
    days: 90,
    limit: 200,
  });
  const summary = summarizePaidBookingAdsRecovery(records);
  const reasons: Record<string, number> = {};
  for (const item of summary.classifications) {
    reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  }
  return {
    scanned: summary.scanned,
    eligible: summary.eligible,
    alreadyUploaded: summary.alreadyUploaded,
    ineligible: summary.ineligible,
    reasons,
    samples: summary.classifications.slice(0, 25).map((item) => ({
      class: item.class,
      reason: item.reason,
      hasClickId: item.hasClickId,
      hasPaymentTimestamp: item.hasPaymentTimestamp,
    })),
  };
}
