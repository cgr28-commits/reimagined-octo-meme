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
  readPendingPaymentForReturn,
  resolveCheckoutIdFromUrl,
  resolveReturnTokenFromUrl,
} from "@/lib/pending-payment";
import { sendPaidBookingEmailsFromBrowser } from "@/lib/send-paid-booking-email";
import { SITE } from "@/lib/data";
import {
  cashDueOnTheDayCopy,
  formatDepositCashGbp,
  isDepositCashPaymentMethod,
} from "../../shared/deposit-cash";

const PAYMENT_CONFIRM_RETRY_MS = 2500;
// About 30 seconds: Stripe can take a little while to mark a payment complete after the redirect.
const PAYMENT_CONFIRM_MAX_ATTEMPTS = 12;
/** After the payment is confirmed, re-check only briefly for follow-up details (emails, calendar). */
const PAYMENT_FOLLOW_UP_MAX_RETRIES = 4;

export type FinalizePaidBookingResult = {
  status: "confirmed" | "pending" | "missing" | "error";
  summary: string;
  amountPaid?: string;
  paymentReference?: string;
  customerReference?: string;
  checkoutId?: string;
  result?: PaymentConfirmationResult;
  error?: string;
};

function buildPaymentConfirmationSummary(
  result: PaymentConfirmationResult,
  customerEmail: string,
): string {
  const depositPrefix =
    isDepositCashPaymentMethod(result.paymentMethod) && typeof result.cashBalanceDue === "number"
      ? `Deposit of ${result.amountPaid} received${
          typeof result.totalFare === "number"
            ? ` against a ${formatDepositCashGbp(result.totalFare)} fare`
            : ""
        }. ${cashDueOnTheDayCopy(result.cashBalanceDue)} `
      : `Payment of ${result.amountPaid} received. `;
  if (result.emailSent === false) {
    return `${depositPrefix}We could not send confirmation emails automatically — our team will confirm your booking manually. If you do not hear from us within an hour, email ${SITE.email}.`;
  }
  if (result.customerEmailSent === false) {
    return `${depositPrefix}We notified our team but could not email your confirmation to ${customerEmail}. Contact us at ${SITE.email} if you need a copy.`;
  }
  return `${depositPrefix}Your booking is confirmed — we’ve emailed confirmation to ${customerEmail}.`;
}

export async function finalizePaidBookingFromUrl(
  search: string,
): Promise<FinalizePaidBookingResult> {
  const params = new URLSearchParams(search);
  const checkoutIdFromUrl = resolveCheckoutIdFromUrl(search);
  const returnToken = resolveReturnTokenFromUrl(search);
  const pending =
    readPendingPaymentForReturn(search);
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
      customerReference: storedResult?.customerReference,
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

  let followUps = 0;
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

      if (paymentNeedsFollowUp(result) && followUps < PAYMENT_FOLLOW_UP_MAX_RETRIES && attempt < PAYMENT_CONFIRM_MAX_ATTEMPTS - 1) {
        followUps += 1;
        await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_CONFIRM_RETRY_MS));
        continue;
      }

      return {
        status: "confirmed",
        summary,
        amountPaid: result.amountPaid,
        paymentReference: result.paymentReference,
        customerReference: result.customerReference,
        checkoutId,
        result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not confirm your payment";

      // "already being processed": Stripe's webhook is finalising the same payment right now.
      // Wait and ask again; the next answer is the finished booking (never a second charge).
      const stillFinalising = message.includes("not been completed") || message.includes("already being processed");
      if (stillFinalising && attempt < PAYMENT_CONFIRM_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_CONFIRM_RETRY_MS));
        continue;
      }

      if (stillFinalising) {
        return {
          status: "pending",
          summary:
            "Your payment is still being confirmed. Please don’t pay again. Wait a minute and press Refresh, or open the payment link from your email. If you need help, call 028 9602 2952.",
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
    summary: "Your payment is still being confirmed. Please don’t pay again. Wait a minute and press Refresh. If you need help, call 028 9602 2952.",
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
