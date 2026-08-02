import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";

export type PaymentCheckoutRequest = {
  amount: number;
  description: string;
  checkoutReference?: string;
  redirectUrl?: string;
};

export type PaymentCheckoutResult = {
  paymentUrl: string;
  checkoutId: string;
};

export type PaymentConfirmationResult = {
  amountPaid: string;
  paymentReference: string;
};

function resolveBookingsApiUrl(): string {
  const bookingsUrl = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!bookingsUrl) {
    return "";
  }

  try {
    const parsed = new URL(bookingsUrl);
    const host = parsed.hostname.toLowerCase();

    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return "";
    }

    return bookingsUrl;
  } catch {
    return "";
  }
}

function resolvePaymentsApiUrl(): string {
  const bookingsUrl = resolveBookingsApiUrl();
  if (!bookingsUrl) {
    return "";
  }

  return bookingsUrl.replace(/\/bookings\/?$/i, "/payments");
}

function resolvePaymentsConfirmApiUrl(): string {
  const bookingsUrl = resolveBookingsApiUrl();
  if (!bookingsUrl) {
    return "";
  }

  return bookingsUrl.replace(/\/bookings\/?$/i, "/payments/confirm");
}

const PAYMENTS_API_URL = resolvePaymentsApiUrl();
const PAYMENTS_CONFIRM_API_URL = resolvePaymentsConfirmApiUrl();

export function isSumUpPaymentEnabled(): boolean {
  return Boolean(PAYMENTS_API_URL);
}

export function buildPaymentRedirectUrl(): string {
  const url = new URL(`${SITE.url}/`);
  url.hash = "quote";
  url.searchParams.set("payment", "return");
  return url.toString();
}

export async function createPaymentCheckout(
  request: PaymentCheckoutRequest,
): Promise<PaymentCheckoutResult> {
  if (!PAYMENTS_API_URL) {
    throw new Error("Online payment is not configured");
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

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as PaymentCheckoutResult).paymentUrl !== "string"
  ) {
    throw new Error("Payment service returned an invalid response");
  }

  return payload as PaymentCheckoutResult;
}

export async function confirmPaidBooking(
  checkoutId: string,
  booking: BookingDetails,
): Promise<PaymentConfirmationResult> {
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
      booking,
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
