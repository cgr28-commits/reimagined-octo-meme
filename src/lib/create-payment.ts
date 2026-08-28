import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";
import {
  resolvePaymentsApiUrl,
  resolvePaymentsConfirmApiUrl,
} from "@/lib/worker-api";
import { isValidPassengerCount, PASSENGER_LIMIT_ERROR } from "../../shared/passenger-limits";
import {
  isValidPersonalQuotePassengerCount,
  PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR,
} from "../../shared/personal-quote";
import { getPaymentBookingBlockers } from "../../shared/paid-booking-gate";
import { readConsentedAdsAttribution } from "@/lib/ads-attribution";

export type PaymentCheckoutRequest = {
  amount: number;
  description: string;
  checkoutReference?: string;
  redirectUrl?: string;
  /** Full booking with customer email + mobile — stored server-side before SumUp redirect. */
  booking?: BookingDetails;
  /** After Owner approval — pay the locked short-notice booking (no re-entry). */
  shortNoticeToken?: string;
  /** After Owner A2A quote approval — pay the locked personalised quote. */
  a2aQuoteToken?: string;
  /**
   * Personal quote code. Server re-validates and overwrites `amount` from KV.
   * Never rely on the client amount when this is set.
   */
  personalQuoteCode?: string;
  /**
   * Quick Quote opaque id. Server re-validates and overwrites `amount` from KV.
   * Never rely on the client amount when this is set.
   */
  quickQuoteId?: string;
  /**
   * Saved Quote opaque token. Server uses the locked fixed price from KV.
   * Never rely on the client amount when this is set.
   */
  savedQuoteToken?: string;
  /** Website-calculated fare for audit only when a personal quote is applied. */
  standardWebsiteAmount?: number;
  /**
   * Customer Express Drop-Off choice only (true/false).
   * Server derives eligibility and fee — never trust a browser-supplied fee/total.
   */
  expressDropOffSelected?: boolean;
  /**
   * Journey fare before airport access and before the £5 booking saving.
   * Used with the authoritative website fare composer on open-website checkout.
   */
  journeyFareGbp?: number;
  /** Undiscounted airport fixed costs already in `amount` (after any valid A2A removals). */
  airportFixedCostsGbp?: number;
  /**
   * Airport-to-airport only: fee line ids the customer independently removed.
   * Ignored for normal airport↔address journeys (fees stay mandatory).
   */
  removedAirportFeeIds?: string[];
  /**
   * When true (default for open website), apply the £5 booking saving when enabled
   * and booking value ≥ £40. Offer is currently disabled in config.
   * Personal / Quick / Saved quotes must pass false.
   */
  claimFirstBookingOffer?: boolean;
};

export type PaymentCheckoutResult = {
  paymentUrl?: string;
  checkoutId?: string;
  checkoutReference?: string;
  /** True only after the Worker has persisted the pending paid-booking record. */
  bookingSaved?: boolean;
  /** Stable server-issued reference for booking-request conversion deduplication. */
  bookingReference?: string;
  ownerAttemptEmailSent?: boolean;
  /** Server diverted to Owner approval instead of SumUp. */
  shortNotice?: boolean;
  reference?: string;
  whatsappUrl?: string;
  automaticBookingsAvailableFrom?: string | null;
  automaticBookingsAvailableFromLabel?: string | null;
  blockingPeriodId?: string | null;
  blockingPeriodLabel?: string | null;
  /** @deprecated Replaced by unavailable periods */
  minimumNoticeHours?: number;
  amount?: number;
  amountLabel?: string;
  status?: string;
  shortNoticeReference?: string;
};

export type PaymentConfirmationResult = {
  amountPaid: string;
  paymentReference: string;
  /** Short customer-facing MAT-#### when available. */
  customerReference?: string;
  emailSent?: boolean;
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  emailWarning?: string;
  trackUrl?: string;
  calendarLogged?: boolean;
  calendarWarning?: string;
  amendmentTopUp?: boolean;
  bookingPaymentReference?: string;
  manageBookingPath?: string;
  /** Server-authored only after SumUp reports the checkout paid. */
  purchase?: {
    transactionId: string;
    bookingReference: string;
    value: number;
    currency: string;
  };
  booking?: {
    paymentReference: string;
    customerReference?: string;
    customerName: string;
    customerEmail: string;
    tripDate: string;
    tripTime: string;
    pickupLabel: string;
    dropoffLabel: string;
    amountPaidLabel: string;
    journeyFare: number;
  };
};

const PAYMENTS_API_URL = resolvePaymentsApiUrl();
const PAYMENTS_CONFIRM_API_URL = resolvePaymentsConfirmApiUrl();

export function isSumUpPaymentEnabled(): boolean {
  return Boolean(PAYMENTS_API_URL);
}

/**
 * SumUp returns customers here — dedicated thank-you URL for Google Ads conversion.
 * Always use the canonical www origin (never apex or the current page host).
 * Apex myairporttaxini.co.uk/booking-confirmed/ 404s; www serves the page.
 */
export function buildPaymentRedirectUrl(returnToken?: string): string {
  const origin = SITE.url.replace(/\/$/, "");
  const url = new URL("/booking-confirmed/", `${origin}/`);
  url.searchParams.set("payment", "return");
  if (returnToken) {
    url.searchParams.set("return_token", returnToken);
  }
  return url.toString();
}

export async function createPaymentCheckout(
  request: PaymentCheckoutRequest,
): Promise<PaymentCheckoutResult> {
  if (!PAYMENTS_API_URL) {
    throw new Error("Online payment is not configured");
  }

  if (!request.shortNoticeToken && !request.a2aQuoteToken) {
    if (!request.booking) {
      throw new Error("Missing booking details");
    }
    const blockers = getPaymentBookingBlockers(request.booking);
    if (blockers.length > 0) {
      throw new Error(blockers[0]);
    }

    if (!isValidPassengerCount(request.booking.passengers)) {
      throw new Error(PASSENGER_LIMIT_ERROR);
    }
    if (
      request.personalQuoteCode &&
      !isValidPersonalQuotePassengerCount(request.booking.passengers)
    ) {
      throw new Error(PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR);
    }
  }

  const attribution = readConsentedAdsAttribution();
  const booking = request.booking
    ? { ...request.booking, ...(attribution ? { attribution } : {}) }
    : undefined;

  const response = await fetch(PAYMENTS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: request.amount,
      description: request.description,
      checkoutReference: request.checkoutReference,
      redirectUrl: request.redirectUrl ?? buildPaymentRedirectUrl(),
      ...(booking ? { booking } : {}),
      ...(request.shortNoticeToken ? { shortNoticeToken: request.shortNoticeToken } : {}),
      ...(request.a2aQuoteToken ? { a2aQuoteToken: request.a2aQuoteToken } : {}),
      ...(request.personalQuoteCode ? { personalQuoteCode: request.personalQuoteCode } : {}),
      ...(request.quickQuoteId ? { quickQuoteId: request.quickQuoteId } : {}),
      ...(request.savedQuoteToken ? { savedQuoteToken: request.savedQuoteToken } : {}),
      ...(typeof request.standardWebsiteAmount === "number"
        ? { standardWebsiteAmount: request.standardWebsiteAmount }
        : {}),
      ...(typeof request.expressDropOffSelected === "boolean"
        ? { expressDropOffSelected: request.expressDropOffSelected }
        : {}),
      ...(typeof request.journeyFareGbp === "number"
        ? { journeyFareGbp: request.journeyFareGbp }
        : {}),
      ...(typeof request.airportFixedCostsGbp === "number"
        ? { airportFixedCostsGbp: request.airportFixedCostsGbp }
        : {}),
      ...(Array.isArray(request.removedAirportFeeIds)
        ? {
            removedAirportFeeIds: request.removedAirportFeeIds
              .map((id) => String(id).trim())
              .filter(Boolean),
          }
        : {}),
      ...(typeof request.claimFirstBookingOffer === "boolean"
        ? { claimFirstBookingOffer: request.claimFirstBookingOffer }
        : {}),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : "Could not start payment";
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Payment service returned an invalid response");
  }

  const result = payload as PaymentCheckoutResult;
  if (result.shortNotice && result.reference && result.whatsappUrl) {
    return result;
  }

  if (typeof result.paymentUrl !== "string") {
    throw new Error("Payment service returned an invalid response");
  }

  return result;
}

export async function confirmPaidBooking(
  checkoutId: string,
  booking?: BookingDetails | null,
): Promise<PaymentConfirmationResult> {
  if (booking && !isValidPassengerCount(booking.passengers)) {
    throw new Error(PASSENGER_LIMIT_ERROR);
  }

  if (!PAYMENTS_CONFIRM_API_URL) {
    throw new Error("Online payment is not configured");
  }

  const response = await fetch(PAYMENTS_CONFIRM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      checkoutId,
      ...(booking ? { booking } : {}),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : "Could not confirm payment";
    throw new Error(message);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as PaymentConfirmationResult).amountPaid !== "string"
  ) {
    throw new Error("Payment confirmation returned an invalid response");
  }

  return payload as PaymentConfirmationResult;
}
