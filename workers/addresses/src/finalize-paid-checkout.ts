import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  formatPaidAmount,
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import {
  getSumUpCheckout,
  getSuccessfulTransactionCode,
  getSuccessfulTransactionId,
  isSumUpCheckoutPaid,
  type SumUpCheckoutDetails,
} from "../shared/sumup-checkout";
import { createTrackingJobForPaidBooking } from "./tracking-handlers";
import { savePaidBookingRecordFromConfirm } from "./refund-handlers";
import {
  getPaidBookingRecordByCheckoutId,
  paidBookingStoreConfigured,
} from "./paid-booking-store";
import {
  getPendingCheckout,
  markPendingCheckoutFinalized,
  pendingCheckoutStoreConfigured,
} from "./pending-checkout-store";
import { maybeRecordMarketingFromPayload } from "./marketing-handlers";
import { trySendBrandedCustomerEmail, trySendOwnerOperationalEmail } from "./worker-email";

const BUSINESS_NAME = "My Airport Taxi NI";

type FinalizeEnv = {
  SUMUP_API_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  EMAIL?: {
    send(message: {
      to: string;
      from: string | { email: string; name?: string };
      subject: string;
      text?: string;
      replyTo?: string | { email: string; name?: string };
    }): Promise<{ messageId?: string }>;
  };
  TRACKING_STORE?: KVNamespace;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
};

export type FinalizePaidCheckoutResult = {
  ok: boolean;
  paid: boolean;
  alreadyFinalized?: boolean;
  amountPaid: string;
  paymentReference: string;
  emailSent: boolean;
  customerEmailSent: boolean;
  ownerEmailSent: boolean;
  emailWarning?: string;
  calendarLogged: boolean;
  calendarEvents: number;
  calendarWarning?: string;
  trackingCreated: boolean;
  trackUrl?: string;
  error?: string;
};

function ownerInbox(env: FinalizeEnv): string {
  return env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk";
}

export type LogPaidBookingCalendarFn = (
  // Caller may pass the full Worker Env; only calendar secrets are required.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env: any,
  booking: PaidBookingDetails,
  amountPaid: string,
  paymentReference: string,
) => Promise<{ logged: boolean; events?: number; eventIds?: string[]; error?: string }>;

/**
 * Verify SumUp payment and send customer + owner confirmation emails.
 * Booking contact details must already be available (from KV pending checkout or client body).
 * Safe to call from browser return and from SumUp webhook — second call is idempotent.
 */
export async function finalizePaidCheckout(input: {
  env: FinalizeEnv;
  checkoutId: string;
  booking: PaidBookingDetails;
  checkout?: SumUpCheckoutDetails;
  logPaidBookingCalendar: LogPaidBookingCalendarFn;
}): Promise<FinalizePaidCheckoutResult> {
  const { env, checkoutId, booking, logPaidBookingCalendar } = input;
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      ok: false,
      paid: false,
      amountPaid: "",
      paymentReference: "",
      emailSent: false,
      customerEmailSent: false,
      ownerEmailSent: false,
      calendarLogged: false,
      calendarEvents: 0,
      trackingCreated: false,
      error: "SumUp payment is not configured",
    };
  }

  if (paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const existing = await getPaidBookingRecordByCheckoutId(env.TRACKING_STORE, checkoutId);
    if (existing) {
      return {
        ok: true,
        paid: true,
        alreadyFinalized: true,
        amountPaid: existing.amountPaidLabel,
        paymentReference: existing.paymentReference,
        emailSent: true,
        customerEmailSent: true,
        ownerEmailSent: true,
        calendarLogged: (existing.calendarEventIds?.length ?? 0) > 0,
        calendarEvents: existing.calendarEventIds?.length ?? 0,
        trackingCreated: Boolean(existing.trackingToken),
      };
    }
  }

  if (pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    const pending = await getPendingCheckout(env.TRACKING_STORE, checkoutId);
    if (pending?.finalizedAt && pending.paymentReference) {
      return {
        ok: true,
        paid: true,
        alreadyFinalized: true,
        amountPaid: formatPaidAmount(pending.amount),
        paymentReference: pending.paymentReference,
        emailSent: true,
        customerEmailSent: true,
        ownerEmailSent: true,
        calendarLogged: false,
        calendarEvents: 0,
        trackingCreated: false,
      };
    }
  }

  const checkout = input.checkout ?? (await getSumUpCheckout(apiKey, checkoutId));

  if (!isSumUpCheckoutPaid(checkout)) {
    return {
      ok: false,
      paid: false,
      amountPaid: "",
      paymentReference: "",
      emailSent: false,
      customerEmailSent: false,
      ownerEmailSent: false,
      calendarLogged: false,
      calendarEvents: 0,
      trackingCreated: false,
      error: "Payment has not been completed yet",
    };
  }

  const amountPaid = formatPaidAmount(checkout.amount ?? 0, checkout.currency ?? "GBP");
  const transactionCode = getSuccessfulTransactionCode(checkout);
  const transactionId = getSuccessfulTransactionId(checkout);
  const paymentReference = transactionCode ?? checkout.checkout_reference ?? checkout.id;

  const receipt = {
    ...booking,
    amountPaid,
    paymentReference,
    transactionCode,
    checkoutReference: checkout.checkout_reference,
  };

  // Live driver tracking soft-hidden until more testing — do not create track jobs/links.
  const LIVE_DRIVER_TRACKING_ENABLED = false;
  const tracking = LIVE_DRIVER_TRACKING_ENABLED
    ? await createTrackingJobForPaidBooking(env, booking, paymentReference)
    : { created: false, trackUrl: undefined as string | undefined, token: undefined as string | undefined };

  const customerEmail = buildCustomerConfirmationEmail(receipt, BUSINESS_NAME, {
    trackUrl: tracking.trackUrl,
  });
  const ownerEmail = buildOwnerPaidBookingEmail(receipt, BUSINESS_NAME, {
    trackUrl: tracking.trackUrl,
  });

  const customerEmailResult = await trySendBrandedCustomerEmail(env, {
    to: booking.customerEmail,
    toName: booking.customerName,
    subject: customerEmail.subject,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  // Full invoice copy to bookings@ (HTML), plus the short owner alert.
  const ownerCopyResult = await trySendBrandedCustomerEmail(env, {
    to: ownerInbox(env),
    toName: "Bookings",
    subject: `[Bookings copy] ${customerEmail.subject}`,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  const ownerEmailResult = await trySendOwnerOperationalEmail(env, {
    to: ownerInbox(env),
    subject: ownerEmail.subject,
    body: ownerEmail.body,
  });
  const ownerNotifySent = ownerCopyResult.sent || ownerEmailResult.sent;

  const calendar = await logPaidBookingCalendar(env, booking, amountPaid, paymentReference);

  await savePaidBookingRecordFromConfirm({
    env,
    booking,
    checkoutId,
    transactionId,
    transactionCode,
    amount: checkout.amount ?? 0,
    currency: checkout.currency ?? "GBP",
    amountPaidLabel: amountPaid,
    paymentReference,
    trackingToken: tracking.token,
    calendarEventIds: calendar.eventIds ?? [],
  });

  await maybeRecordMarketingFromPayload(env.TRACKING_STORE, {
    email: booking.customerEmail,
    name: booking.customerName,
    source: "paid-booking",
    marketingOptIn: booking.marketingOptIn,
    marketingOptInAt: booking.marketingOptInAt,
    marketingConsentVersion: booking.marketingConsentVersion,
  });

  if (pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    await markPendingCheckoutFinalized(env.TRACKING_STORE, checkoutId, paymentReference);
  }

  const emailSent = customerEmailResult.sent && ownerNotifySent;
  const emailWarnings: string[] = [];

  if (!customerEmailResult.sent) {
    emailWarnings.push(
      customerEmailResult.error
        ? `Customer confirmation email failed: ${customerEmailResult.error}`
        : "Customer confirmation email failed",
    );
  }

  if (!ownerNotifySent) {
    emailWarnings.push(
      ownerEmailResult.error || ownerCopyResult.error
        ? `Owner notification email failed: ${ownerEmailResult.error || ownerCopyResult.error}`
        : "Owner notification email failed",
    );
  }

  return {
    ok: true,
    paid: true,
    amountPaid,
    paymentReference,
    emailSent,
    customerEmailSent: customerEmailResult.sent,
    ownerEmailSent: ownerNotifySent,
    ...(emailWarnings.length > 0 ? { emailWarning: emailWarnings.join("; ") } : {}),
    calendarLogged: calendar.logged,
    calendarEvents: calendar.events ?? 0,
    ...(calendar.error ? { calendarWarning: calendar.error } : {}),
    trackingCreated: tracking.created,
    ...(tracking.trackUrl ? { trackUrl: tracking.trackUrl } : {}),
  };
}

/** Prefer server-stored booking (has contact details) over a thin client payload. */
export async function resolveBookingForCheckout(
  env: FinalizeEnv,
  checkoutId: string,
  clientBooking: PaidBookingDetails | null,
): Promise<PaidBookingDetails | null> {
  if (pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    const pending = await getPendingCheckout(env.TRACKING_STORE, checkoutId);
    if (pending?.booking?.customerEmail && pending.booking.mobileNumber) {
      return pending.booking;
    }
    if (pending?.booking?.customerEmail) {
      // Merge mobile from client if pending was stored without it (legacy).
      if (clientBooking?.mobileNumber && !pending.booking.mobileNumber) {
        return { ...pending.booking, mobileNumber: clientBooking.mobileNumber };
      }
      return pending.booking;
    }
  }
  return clientBooking;
}

export function extractCheckoutIdFromWebhookPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const body = payload as Record<string, unknown>;
  const direct =
    String(body.id ?? body.checkout_id ?? body.checkoutId ?? "").trim() ||
    String((body.data as Record<string, unknown> | undefined)?.id ?? "").trim() ||
    String((body.checkout as Record<string, unknown> | undefined)?.id ?? "").trim();
  return direct;
}
