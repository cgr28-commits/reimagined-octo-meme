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

export type PaymentCheckoutRequest = {
  amount: number;
  description: string;
  checkoutReference?: string;
  redirectUrl?: string;
  /** Full booking with customer email + mobile — stored server-side before SumUp redirect. */
  booking?: BookingDetails;
  /** After Owner approval — pay the locked short-notice booking (no re-entry). */
  shortNoticeToken?: string;
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
};

export type PaymentCheckoutResult = {
  paymentUrl?: string;
  checkoutId?: string;
  checkoutReference?: string;
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
  emailSent?: boolean;
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  emailWarning?: string;
  trackUrl?: string;
  calendarLogged?: boolean;
  calendarWarning?: string;
};

const PAYMENTS_API_URL = resolvePaymentsApiUrl();
const PAYMENTS_CONFIRM_API_URL = resolvePaymentsConfirmApiUrl();

export function isSumUpPaymentEnabled(): boolean {
  return Boolean(PAYMENTS_API_URL);
}

/** SumUp returns customers here — dedicated thank-you URL for Google Ads conversion. */
export function buildPaymentRedirectUrl(returnToken?: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : SITE.url.replace(/\/$/, "");
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

  if (!request.shortNoticeToken) {
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
      ...(request.booking ? { booking: request.booking } : {}),
      ...(request.shortNoticeToken ? { shortNoticeToken: request.shortNoticeToken } : {}),
      ...(request.personalQuoteCode ? { personalQuoteCode: request.personalQuoteCode } : {}),
      ...(request.quickQuoteId ? { quickQuoteId: request.quickQuoteId } : {}),
      ...(request.savedQuoteToken ? { savedQuoteToken: request.savedQuoteToken } : {}),
      ...(typeof request.standardWebsiteAmount === "number"
        ? { standardWebsiteAmount: request.standardWebsiteAmount }
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
