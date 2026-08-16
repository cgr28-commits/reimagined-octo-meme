import type { BookingDetails } from "@/lib/booking-message";
import {
  confirmPaidBooking,
  type PaymentConfirmationResult,
} from "@/lib/create-payment";
import {
  hasConfirmedPayment,
  markPaymentConfirmed,
  paymentNeedsFollowUp,
  readPaymentConfirmationResult,
  readPaymentConfirmationSummary,
  readPendingPayment,
  readPendingPaymentByToken,
  resolveCheckoutIdFromUrl,
  resolveReturnTokenFromUrl,
} from "@/lib/pending-payment";
import { sendPaidBookingEmailsFromBrowser } from "@/lib/send-paid-booking-email";
import { SITE } from "@/lib/data";

const PAYMENT_CONFIRM_RETRY_MS = 2000;
const PAYMENT_CONFIRM_MAX_ATTEMPTS = 5;

export type FinalizePaidBookingResult = {
  status: "confirmed" | "pending" | "missing" | "error";
  summary: string;
  amountPaid?: string;
  paymentReference?: string;
  checkoutId?: string;
  result?: PaymentConfirmationResult;
  error?: string;
};

function buildPaymentConfirmationSummary(
  result: PaymentConfirmationResult,
  customerEmail: string,
): string {
  if (result.emailSent === false) {
    return `Payment of ${result.amountPaid} received. We could not send confirmation emails automatically — our team will confirm your booking manually. If you do not hear from us within an hour, email ${SITE.email}.`;
  }
  if (result.customerEmailSent === false) {
    return `Payment of ${result.amountPaid} received. We notified our team but could not email your confirmation to ${customerEmail}. Contact us at ${SITE.email} if you need a copy.`;
  }
  return `Payment of ${result.amountPaid} received. Your booking is confirmed — we’ve emailed confirmation to ${customerEmail}.`;
}

export async function finalizePaidBookingFromUrl(
  search: string,
): Promise<FinalizePaidBookingResult> {
  const params = new URLSearchParams(search);
  const checkoutIdFromUrl = resolveCheckoutIdFromUrl(search);
  const returnToken = resolveReturnTokenFromUrl(search);
  const pending =
    readPendingPayment() || (returnToken ? readPendingPaymentByToken(returnToken) : null);
  const checkoutId = checkoutIdFromUrl || pending?.checkoutId || "";

  if (checkoutId && hasConfirmedPayment(checkoutId)) {
    const storedResult = readPaymentConfirmationResult(checkoutId);
    const savedSummary =
      readPaymentConfirmationSummary(checkoutId) ||
      "Your booking is confirmed. Thank you for your payment.";
    return {
      status: "confirmed",
      summary: savedSummary,
      amountPaid: storedResult?.amountPaid,
      paymentReference: storedResult?.paymentReference,
      checkoutId,
      result: storedResult ?? undefined,
    };
  }

  if (!checkoutId) {
    return {
      status: "missing",
      summary:
        "If you just paid, check your email for confirmation. You can also email us with your booking details.",
    };
  }

  // Prefer browser-stored booking, but server KV pending-checkout is enough
  // when the customer returns without localStorage (new device / cleared storage).
  const booking: BookingDetails | null = pending?.booking ?? null;

  for (let attempt = 0; attempt < PAYMENT_CONFIRM_MAX_ATTEMPTS; attempt += 1) {
    try {
      let result = await confirmPaidBooking(checkoutId, booking);

      if (booking && (result.customerEmailSent !== true || result.ownerEmailSent !== true)) {
        try {
          const fallback = await sendPaidBookingEmailsFromBrowser(booking, result);
          result = {
            ...result,
            customerEmailSent: result.customerEmailSent === true || fallback.customerEmailSent,
            ownerEmailSent: result.ownerEmailSent === true || fallback.ownerEmailSent,
            emailSent:
              (result.customerEmailSent === true || fallback.customerEmailSent) &&
              (result.ownerEmailSent === true || fallback.ownerEmailSent),
          };
        } catch (fallbackError) {
          console.error("Browser booking email fallback failed", fallbackError);
        }
      }

      const summary = buildPaymentConfirmationSummary(
        result,
        booking?.customerEmail || "your email",
      );
      markPaymentConfirmed(checkoutId, summary, returnToken || undefined, result);

      if (paymentNeedsFollowUp(result) && attempt < PAYMENT_CONFIRM_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_CONFIRM_RETRY_MS));
        continue;
      }

      return {
        status: "confirmed",
        summary,
        amountPaid: result.amountPaid,
        paymentReference: result.paymentReference,
        checkoutId,
        result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not confirm your payment";

      if (message.includes("not been completed") && attempt < PAYMENT_CONFIRM_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_CONFIRM_RETRY_MS));
        continue;
      }

      if (message.includes("not been completed")) {
        return {
          status: "pending",
          summary:
            "Payment isn’t showing as complete yet. Wait a few seconds and refresh this page, or open the SumUp link from your email again.",
          checkoutId,
          error: message,
        };
      }

      return {
        status: "error",
        summary: message,
        checkoutId,
        error: message,
      };
    }
  }

  return {
    status: "pending",
    summary: "Payment is still processing. Please refresh this page in a moment.",
    checkoutId,
  };
}

/** Parse a £ amount label into a number for Ads conversion value. */
export function parseAmountValue(amountPaid?: string): number | undefined {
  if (!amountPaid?.trim()) return undefined;
  const match = amountPaid.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function isPaymentReturnSearch(search: string): boolean {
  return new URLSearchParams(search).get("payment") === "return";
}
