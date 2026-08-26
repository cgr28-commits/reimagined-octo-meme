/**
 * After SumUp PAID finalize: upload Paid Booking to Google Ads once per payment.
 * Never throws — payment confirmation must not fail because Ads is unavailable.
 */

import type { AdsAttribution } from "../shared/ads-attribution";
import {
  isGoogleAdsClickConversionConfigured,
  uploadPaidBookingClickConversion,
  type GoogleAdsClickConversionEnv,
  type PaidBookingAdsConversionStatus,
} from "../shared/google-ads-click-conversions";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  getPaidBookingRecord,
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";

export type PaidBookingAdsConversionEnv = GoogleAdsClickConversionEnv & {
  TRACKING_STORE?: KVNamespace;
};

function shouldSkipUpload(record: PaidBookingRecord): boolean {
  if (record.googleAdsPaidConversionSentAt) return true;
  const status = record.googleAdsPaidConversionStatus;
  // Terminal: uploaded, Google duplicate, or no click id to attribute.
  // Retry when secrets were missing or a prior attempt failed.
  return (
    status === "sent" ||
    status === "skipped_duplicate" ||
    status === "skipped_no_click_id"
  );
}

async function persistConversionOutcome(
  store: KVNamespace,
  paymentReference: string,
  outcome: {
    status: PaidBookingAdsConversionStatus;
    orderId: string;
    clickIdType?: "gclid" | "gbraid" | "wbraid";
    error?: string;
  },
): Promise<void> {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record) return;
  if (shouldSkipUpload(record) && outcome.status !== "sent") return;

  const next: PaidBookingRecord = {
    ...record,
    googleAdsPaidConversionOrderId: outcome.orderId || record.googleAdsPaidConversionOrderId,
    googleAdsPaidConversionStatus: outcome.status,
    ...(outcome.clickIdType
      ? { googleAdsPaidConversionClickIdType: outcome.clickIdType }
      : {}),
  };

  if (outcome.status === "sent" || outcome.status === "skipped_duplicate") {
    next.googleAdsPaidConversionSentAt =
      record.googleAdsPaidConversionSentAt || new Date().toISOString();
    delete next.googleAdsPaidConversionLastError;
  } else if (outcome.status === "failed") {
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
}): Promise<void> {
  const paymentReference = input.paymentReference.trim();
  if (!paymentReference) return;
  if (input.isRefundTest || input.isAmendmentTopUp) return;

  if (!paidBookingStoreConfigured(input.env.TRACKING_STORE)) {
    return;
  }

  const store = input.env.TRACKING_STORE;
  const existing = await getPaidBookingRecord(store, paymentReference);
  if (existing && shouldSkipUpload(existing)) {
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

  const attribution = input.attribution ?? existing?.attribution ?? null;
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
  });

  await persistConversionOutcome(store, paymentReference, {
    status: result.status,
    orderId: result.orderId || paymentReference,
    clickIdType: result.clickIdType,
    error: result.error,
  });

  if (result.status === "failed") {
    console.error("Google Ads Paid Booking upload failed", {
      paymentReference,
      error: result.error,
    });
  } else {
    console.info("Google Ads Paid Booking upload", {
      paymentReference,
      status: result.status,
      clickIdType: result.clickIdType,
    });
  }
}
