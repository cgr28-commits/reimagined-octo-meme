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
  getPaidBookingRecord,
  getPaidBookingRecordByCheckoutId,
  ensureManageBookingToken,
  paidBookingStoreConfigured,
} from "./paid-booking-store";
import { buildManageBookingUrl } from "../shared/manage-booking-token";
import {
  getPendingCheckout,
  markPendingCheckoutFinalized,
  pendingCheckoutStoreConfigured,
} from "./pending-checkout-store";
import { finalizeAmendmentTopUpCheckout, type FinalizeAmendmentTopUpResult } from "./amendment-topup";
import { markShortNoticePaid } from "./short-notice-handlers";
import { markPersonalQuoteUsed } from "./personal-quote-store";
import { markQuickQuotePaid } from "./quick-quote-store";
import { markSavedQuoteBookedFromPayment } from "./saved-quote-handlers";
import { maybeRecordMarketingFromPayload } from "./marketing-handlers";
import { trySendBrandedCustomerEmail, trySendOwnerOperationalEmail } from "./worker-email";
import { maybeUploadPaidBookingAdsConversion } from "./paid-booking-ads-conversion";

const BUSINESS_NAME = "My Airport Taxi NI";

type FinalizeEnv = {
  SUMUP_API_KEY?: string;
  RESEND_API_KEY?: string;
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
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  GOOGLE_ADS_CUSTOMER_ID?: string;
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
  GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID?: string;
};

export type FinalizePaidCheckoutResult = {
  ok: boolean;
  paid: boolean;
  alreadyFinalized?: boolean;
  amountPaid: string;
  paymentReference: string;
  /** Short customer-facing MAT-#### reference when available. */
  customerReference?: string;
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
  /** Set when this checkout amended an existing booking instead of creating one. */
  amendmentTopUp?: boolean;
  bookingPaymentReference?: string;
  manageBookingPath?: string;
  amendmentBooking?: FinalizeAmendmentTopUpResult["booking"];
  /** Safe measurement payload authored only after SumUp PAID verification. */
  purchase?: {
    transactionId: string;
    bookingReference: string;
    value: number;
    currency: string;
  };
};

function verifiedPurchase(input: {
  paymentReference: string;
  customerReference?: string;
  amount: number;
  currency?: string;
}): NonNullable<FinalizePaidCheckoutResult["purchase"]> | undefined {
  const paymentReference = input.paymentReference.trim();
  const bookingReference = input.customerReference?.trim() || paymentReference;
  if (!bookingReference || !Number.isFinite(input.amount) || input.amount <= 0) return undefined;
  return {
    transactionId: bookingReference,
    bookingReference,
    value: Math.round(input.amount * 100) / 100,
    currency: input.currency?.trim().toUpperCase() || "GBP",
  };
}

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
    // Amendment top-ups must not be mistaken for a new booking via checkout index.
    const pendingEarly = pendingCheckoutStoreConfigured(env.TRACKING_STORE)
      ? await getPendingCheckout(env.TRACKING_STORE, checkoutId)
      : null;
    if (pendingEarly?.checkoutKind === "amendment-topup") {
      // Fall through after SumUp PAID check below — handled in dedicated branch.
    } else {
      const existing = await getPaidBookingRecordByCheckoutId(env.TRACKING_STORE, checkoutId);
      if (existing) {
        if (!existing.isRefundTest) {
          await maybeUploadPaidBookingAdsConversion({
            env,
            paymentReference: existing.paymentReference,
            amount: existing.amount,
            currency: existing.currency,
            attribution: existing.attribution ?? booking.attribution,
          });
        }
        return {
          ok: true,
          paid: true,
          alreadyFinalized: true,
          amountPaid: existing.amountPaidLabel,
          paymentReference: existing.paymentReference,
          customerReference: existing.customerReference,
          emailSent: true,
          customerEmailSent: true,
          ownerEmailSent: true,
          calendarLogged: (existing.calendarEventIds?.length ?? 0) > 0,
          calendarEvents: existing.calendarEventIds?.length ?? 0,
          trackingCreated: Boolean(existing.trackingToken),
          purchase: verifiedPurchase({
            paymentReference: existing.paymentReference,
            customerReference: existing.customerReference,
            amount: existing.amount,
            currency: existing.currency,
          }),
        };
      }
    }
  }

  if (pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    const pending = await getPendingCheckout(env.TRACKING_STORE, checkoutId);
    if (pending?.finalizedAt && pending.paymentReference) {
      if (pending.checkoutKind !== "amendment-topup" && pending.isRefundTest !== true) {
        await maybeUploadPaidBookingAdsConversion({
          env,
          paymentReference: pending.paymentReference,
          amount: pending.amount,
          currency: "GBP",
          attribution: pending.booking?.attribution ?? booking.attribution,
        });
      }
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
        purchase: verifiedPurchase({
          paymentReference: pending.paymentReference,
          amount: pending.amount,
          currency: "GBP",
        }),
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

  const pendingForAudit = pendingCheckoutStoreConfigured(env.TRACKING_STORE)
    ? await getPendingCheckout(env.TRACKING_STORE, checkoutId)
    : null;
  const isRefundTest = pendingForAudit?.isRefundTest === true;
  const isAmendmentTopUp = pendingForAudit?.checkoutKind === "amendment-topup";

  if (isAmendmentTopUp && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const topUp = await finalizeAmendmentTopUpCheckout({
      env: env as typeof env & { TRACKING_STORE: KVNamespace },
      checkoutId,
      checkout,
    });
    return {
      ok: topUp.ok,
      paid: topUp.paid,
      alreadyFinalized: topUp.alreadyFinalized,
      amountPaid: topUp.amountPaid,
      paymentReference: topUp.bookingPaymentReference || topUp.paymentReference,
      emailSent: topUp.customerEmailSent,
      customerEmailSent: topUp.customerEmailSent,
      ownerEmailSent: false,
      emailWarning: topUp.emailWarning || topUp.error,
      calendarLogged: Boolean(topUp.amendmentCommitted),
      calendarEvents: 0,
      trackingCreated: false,
      amendmentTopUp: true,
      bookingPaymentReference: topUp.bookingPaymentReference,
      manageBookingPath: "/manage-booking/",
      amendmentBooking: topUp.booking,
      error: topUp.ok ? undefined : topUp.error,
    };
  }

  // Owner-only £1 live SumUp refund smoke test — no journey, calendar, or customer emails.
  if (isRefundTest) {
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
      trackingToken: undefined,
      calendarEventIds: [],
      isRefundTest: true,
    });

    if (pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
      await markPendingCheckoutFinalized(env.TRACKING_STORE, checkoutId, paymentReference);
    }

    const ownerTestNotice = await trySendOwnerOperationalEmail(env, {
      to: ownerInbox(env),
      subject: `REFUND TEST £1 PAID — ${paymentReference}`,
      body:
        `LIVE SUMUP REFUND TEST — REAL £1 PAYMENT\n\n` +
        `A £1.00 SumUp hosted checkout completed for an owner refund smoke test.\n` +
        `Payment reference: ${paymentReference}\n` +
        `Checkout ID: ${checkoutId}\n` +
        `Transaction ID: ${transactionId ?? "—"}\n` +
        `Transaction code: ${transactionCode ?? "—"}\n\n` +
        `No customer journey, tracking link, or Google Calendar event was created.\n` +
        `No customer booking confirmation email was sent.\n` +
        `Use Owner → Refund Test to run diagnostics and issue test refunds via the normal refund coordinator.\n`,
    });

    return {
      ok: true,
      paid: true,
      amountPaid,
      paymentReference,
      emailSent: ownerTestNotice.sent,
      customerEmailSent: false,
      ownerEmailSent: ownerTestNotice.sent,
      emailWarning: ownerTestNotice.sent
        ? undefined
        : ownerTestNotice.error || "Owner refund-test notice failed",
      calendarLogged: false,
      calendarEvents: 0,
      trackingCreated: false,
    };
  }

  const receiptBase = {
    ...booking,
    amountPaid,
    paymentReference,
    transactionCode,
    checkoutReference: checkout.checkout_reference,
  };

  // Create live tracking jobs/links for paid bookings (customer + journey evidence).
  const LIVE_DRIVER_TRACKING_ENABLED = true;
  const tracking = LIVE_DRIVER_TRACKING_ENABLED
    ? await createTrackingJobForPaidBooking(env, booking, paymentReference)
    : { created: false, trackUrl: undefined as string | undefined, token: undefined as string | undefined };

  const calendar = await logPaidBookingCalendar(env, booking, amountPaid, paymentReference);

  // Allocate short MAT-#### before emails so confirmation shows the customer reference.
  const customerReference = paidBookingStoreConfigured(env.TRACKING_STORE)
    ? await savePaidBookingRecordFromConfirm({
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
        ...(pendingForAudit?.personalQuoteCode
          ? { personalQuoteCode: pendingForAudit.personalQuoteCode }
          : {}),
        ...(typeof pendingForAudit?.standardWebsiteAmount === "number"
          ? { standardWebsiteAmount: pendingForAudit.standardWebsiteAmount }
          : {}),
        ...(typeof pendingForAudit?.personalQuotedAmount === "number"
          ? { personalQuotedAmount: pendingForAudit.personalQuotedAmount }
          : {}),
      })
    : undefined;

  const receipt = {
    ...receiptBase,
    customerReference,
  };

  let manageUrl: string | undefined;
  if (paidBookingStoreConfigured(env.TRACKING_STORE) && paymentReference) {
    const saved = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
    if (saved) {
      const withToken = await ensureManageBookingToken(env.TRACKING_STORE, saved);
      if (withToken.manageBookingToken) {
        manageUrl = buildManageBookingUrl(
          "https://www.myairporttaxini.co.uk",
          withToken.manageBookingToken,
        );
      }
    }
  }

  const customerEmail = buildCustomerConfirmationEmail(receipt, BUSINESS_NAME, {
    trackUrl: tracking.trackUrl,
    manageUrl,
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
    const pending = pendingForAudit ?? (await getPendingCheckout(env.TRACKING_STORE, checkoutId));
    if (pending?.shortNoticeToken) {
      await markShortNoticePaid(
        env.TRACKING_STORE,
        pending.shortNoticeToken,
        paymentReference,
        checkoutId,
      );
    }
    // Consume single-use personal quotes only after SumUp PAID finalize — never on Pay click.
    if (pending?.personalQuoteCode) {
      await markPersonalQuoteUsed(
        env.TRACKING_STORE,
        pending.personalQuoteCode,
        paymentReference,
        checkoutId,
      );
    }
    if (pending?.quickQuoteId) {
      await markQuickQuotePaid(env.TRACKING_STORE, pending.quickQuoteId, paymentReference);
    }
    if (pending?.savedQuoteToken) {
      await markSavedQuoteBookedFromPayment(env.TRACKING_STORE, pending.savedQuoteToken, {
        paymentReference,
        checkoutId,
      });
    }
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

  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference,
    amount: checkout.amount ?? 0,
    currency: checkout.currency ?? "GBP",
    attribution: booking.attribution,
  });

  return {
    ok: true,
    paid: true,
    amountPaid,
    paymentReference,
    ...(customerReference ? { customerReference } : {}),
    emailSent,
    customerEmailSent: customerEmailResult.sent,
    ownerEmailSent: ownerNotifySent,
    ...(emailWarnings.length > 0 ? { emailWarning: emailWarnings.join("; ") } : {}),
    calendarLogged: calendar.logged,
    calendarEvents: calendar.events ?? 0,
    ...(calendar.error ? { calendarWarning: calendar.error } : {}),
    trackingCreated: tracking.created,
    ...(tracking.trackUrl ? { trackUrl: tracking.trackUrl } : {}),
    purchase: verifiedPurchase({
      paymentReference,
      customerReference,
      amount: checkout.amount ?? 0,
      currency: checkout.currency,
    }),
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

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function checkoutIdFromRecord(record: Record<string, unknown> | null | undefined): string {
  if (!record) return "";
  const nestedData =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined;
  const nestedCheckout =
    record.checkout && typeof record.checkout === "object"
      ? (record.checkout as Record<string, unknown>)
      : undefined;
  const nestedPayload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : undefined;
  const nestedEvent =
    record.event && typeof record.event === "object"
      ? (record.event as Record<string, unknown>)
      : undefined;

  return firstNonEmpty(
    record.id,
    record.checkout_id,
    record.checkoutId,
    record.checkout_uuid,
    record.resource_id,
    nestedData?.id,
    nestedData?.checkout_id,
    nestedData?.checkoutId,
    nestedCheckout?.id,
    nestedCheckout?.checkout_id,
    nestedPayload?.id,
    nestedPayload?.checkout_id,
    nestedEvent?.id,
    nestedEvent?.checkout_id,
  );
}

/** Extract SumUp checkout id from webhook JSON (and common nested shapes). */
export function extractCheckoutIdFromWebhookPayload(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    // Bare UUID or id string
    if (/^[0-9a-f-]{20,}$/i.test(trimmed)) return trimmed;
    try {
      return extractCheckoutIdFromWebhookPayload(JSON.parse(trimmed));
    } catch {
      return "";
    }
  }
  if (typeof payload !== "object") return "";
  return checkoutIdFromRecord(payload as Record<string, unknown>);
}

/** Also accept checkout id from query string / form fields (SumUp return variants). */
export function extractCheckoutIdFromRequest(
  request: Request,
  payload: unknown,
): string {
  const fromBody = extractCheckoutIdFromWebhookPayload(payload);
  if (fromBody) return fromBody;

  const url = new URL(request.url);
  const fromQuery = firstNonEmpty(
    url.searchParams.get("id"),
    url.searchParams.get("checkout_id"),
    url.searchParams.get("checkoutId"),
    url.searchParams.get("checkout-id"),
  );
  if (fromQuery) return fromQuery;

  return "";
}
