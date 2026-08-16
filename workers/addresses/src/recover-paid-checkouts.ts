/**
 * Idempotent recovery for SumUp PAID checkouts that never finished finalize
 * (customer email / bookings@ copy / Google Calendar / paid booking record).
 *
 * Safe to call repeatedly — already-finalized checkouts are skipped (no duplicate
 * emails or calendar events). Missing calendar on an existing paid record can be
 * backfilled once; emails are never auto-resent (owner uses Resend).
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  getSumUpCheckout,
  isSumUpCheckoutPaid,
} from "../shared/sumup-checkout";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  finalizePaidCheckout,
  type FinalizePaidCheckoutResult,
  type LogPaidBookingCalendarFn,
  resolveBookingForCheckout,
} from "./finalize-paid-checkout";
import {
  getPaidBookingRecordByCheckoutId,
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";
import {
  getPendingCheckout,
  listRecentPendingCheckouts,
  pendingCheckoutStoreConfigured,
  type PendingCheckoutRecord,
} from "./pending-checkout-store";

type RecoverEnv = {
  SUMUP_API_KEY?: string;
  TRACKING_STORE?: KVNamespace;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
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
};

export type RecoverCheckoutResult = {
  checkoutId: string;
  sumUpStatus: string;
  paid: boolean;
  action: "finalized" | "already_finalized" | "calendar_backfill" | "skipped" | "error";
  bookingStatus: "paid" | "pending" | "missing" | "unknown";
  customerEmailSent: boolean;
  ownerEmailSent: boolean;
  calendarLogged: boolean;
  calendarEvents: number;
  paymentReference?: string;
  amountPaid?: string;
  alreadyFinalized?: boolean;
  error?: string;
  emailWarning?: string;
  calendarWarning?: string;
};

export type PendingCheckoutOwnerView = {
  checkoutId: string;
  checkoutReference: string;
  amount: number;
  createdAt: string;
  finalizedAt?: string;
  paymentReference?: string;
  customerName: string;
  customerEmail: string;
  tripLabel: string;
  tripDate: string;
  sumUpStatus?: string;
  sumUpPaid?: boolean;
  paidBookingExists: boolean;
  needsFinalize: boolean;
};

function isLikelyTestOnePound(pending: PendingCheckoutRecord): boolean {
  if (Math.abs(pending.amount - 1) < 0.001) return true;
  const label = `${pending.booking.tripLabel ?? ""} ${pending.checkoutReference ?? ""}`;
  return /\[?\s*TEST\s*£?\s*1\s*\]?/i.test(label) || /test\s*£?\s*1/i.test(label);
}

export async function buildPendingCheckoutOwnerViews(
  env: RecoverEnv,
  options?: { limit?: number },
): Promise<PendingCheckoutOwnerView[]> {
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return [];
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const pending = await listRecentPendingCheckouts(env.TRACKING_STORE, {
    limit: options?.limit ?? 40,
  });
  const views: PendingCheckoutOwnerView[] = [];

  for (const record of pending) {
    let sumUpStatus: string | undefined;
    let sumUpPaid: boolean | undefined;
    if (apiKey) {
      try {
        const checkout = await getSumUpCheckout(apiKey, record.checkoutId);
        sumUpStatus = String(checkout.status ?? "UNKNOWN");
        sumUpPaid = isSumUpCheckoutPaid(checkout);
      } catch {
        sumUpStatus = "LOOKUP_FAILED";
        sumUpPaid = false;
      }
    }

    const paidRecord = paidBookingStoreConfigured(env.TRACKING_STORE)
      ? await getPaidBookingRecordByCheckoutId(env.TRACKING_STORE, record.checkoutId)
      : null;

    const needsFinalize = Boolean(
      sumUpPaid && !record.finalizedAt && !paidRecord,
    );

    views.push({
      checkoutId: record.checkoutId,
      checkoutReference: record.checkoutReference,
      amount: record.amount,
      createdAt: record.createdAt,
      finalizedAt: record.finalizedAt,
      paymentReference: record.paymentReference ?? paidRecord?.paymentReference,
      customerName: record.booking.customerName,
      customerEmail: record.booking.customerEmail,
      tripLabel: record.booking.tripLabel,
      tripDate: record.booking.tripDate,
      sumUpStatus,
      sumUpPaid,
      paidBookingExists: Boolean(paidRecord),
      needsFinalize,
    });
  }

  return views;
}

async function backfillCalendarIfNeeded(input: {
  env: RecoverEnv;
  checkoutId: string;
  existing: PaidBookingRecord;
  booking: PaidBookingDetails;
  logPaidBookingCalendar: LogPaidBookingCalendarFn;
}): Promise<RecoverCheckoutResult> {
  const { env, checkoutId, existing, booking, logPaidBookingCalendar } = input;
  const hasCalendar = (existing.calendarEventIds?.length ?? 0) > 0;

  if (hasCalendar || !paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return {
      checkoutId,
      sumUpStatus: "PAID",
      paid: true,
      action: "already_finalized",
      bookingStatus: "paid",
      customerEmailSent: true,
      ownerEmailSent: true,
      calendarLogged: hasCalendar,
      calendarEvents: existing.calendarEventIds?.length ?? 0,
      paymentReference: existing.paymentReference,
      amountPaid: existing.amountPaidLabel,
      alreadyFinalized: true,
    };
  }

  const calendar = await logPaidBookingCalendar(
    env,
    booking,
    existing.amountPaidLabel,
    existing.paymentReference,
  );

  if (calendar.logged && (calendar.eventIds?.length ?? 0) > 0) {
    await savePaidBookingRecord(env.TRACKING_STORE, {
      ...existing,
      calendarEventIds: calendar.eventIds ?? [],
    });
  }

  return {
    checkoutId,
    sumUpStatus: "PAID",
    paid: true,
    action: calendar.logged ? "calendar_backfill" : "already_finalized",
    bookingStatus: "paid",
    customerEmailSent: true,
    ownerEmailSent: true,
    calendarLogged: calendar.logged || hasCalendar,
    calendarEvents: calendar.events ?? existing.calendarEventIds?.length ?? 0,
    paymentReference: existing.paymentReference,
    amountPaid: existing.amountPaidLabel,
    alreadyFinalized: true,
    ...(calendar.error ? { calendarWarning: calendar.error } : {}),
  };
}

function mapFinalizeResult(
  checkoutId: string,
  sumUpStatus: string,
  result: FinalizePaidCheckoutResult,
): RecoverCheckoutResult {
  return {
    checkoutId,
    sumUpStatus,
    paid: result.paid,
    action: result.alreadyFinalized
      ? "already_finalized"
      : result.ok
        ? "finalized"
        : "error",
    bookingStatus: result.ok || result.paid ? "paid" : "pending",
    customerEmailSent: result.customerEmailSent,
    ownerEmailSent: result.ownerEmailSent,
    calendarLogged: result.calendarLogged,
    calendarEvents: result.calendarEvents,
    paymentReference: result.paymentReference || undefined,
    amountPaid: result.amountPaid || undefined,
    alreadyFinalized: result.alreadyFinalized,
    ...(result.error ? { error: result.error } : {}),
    ...(result.emailWarning ? { emailWarning: result.emailWarning } : {}),
    ...(result.calendarWarning ? { calendarWarning: result.calendarWarning } : {}),
  };
}

/**
 * Finalize one checkout if SumUp shows PAID and it is not yet stored as paid.
 * Never creates a new SumUp charge. Never re-sends emails for already-finalized.
 */
export async function recoverPaidCheckout(input: {
  env: RecoverEnv;
  checkoutId: string;
  logPaidBookingCalendar: LogPaidBookingCalendarFn;
  clientBooking?: PaidBookingDetails | null;
}): Promise<RecoverCheckoutResult> {
  const { env, checkoutId, logPaidBookingCalendar } = input;
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";

  if (!apiKey) {
    return {
      checkoutId,
      sumUpStatus: "UNCONFIGURED",
      paid: false,
      action: "error",
      bookingStatus: "unknown",
      customerEmailSent: false,
      ownerEmailSent: false,
      calendarLogged: false,
      calendarEvents: 0,
      error: "SumUp payment is not configured",
    };
  }

  if (paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const existing = await getPaidBookingRecordByCheckoutId(env.TRACKING_STORE, checkoutId);
    if (existing) {
      const booking =
        (await resolveBookingForCheckout(env, checkoutId, input.clientBooking ?? null)) ??
        ({
          customerName: existing.customerName,
          customerEmail: existing.customerEmail,
          mobileNumber: existing.mobileNumber,
          tripLabel: existing.tripLabel,
          pickupLabel: existing.pickupLabel,
          dropoffLabel: existing.dropoffLabel,
          returnJourney: existing.returnJourney,
          tripDate: existing.tripDate,
          tripTime: existing.tripTime,
          returnDate: existing.returnDate ?? "",
          returnTime: existing.returnTime ?? "",
          flightNumber: existing.flightNumber ?? "",
          returnFlightNumber: existing.returnFlightNumber ?? "",
          passengers: existing.passengers ?? 1,
          suitcases: existing.suitcases ?? 0,
          vehicle: existing.vehicle ?? "Saloon",
          isAirportTrip: existing.isAirportTrip ?? false,
        } satisfies PaidBookingDetails);

      return backfillCalendarIfNeeded({
        env,
        checkoutId,
        existing,
        booking,
        logPaidBookingCalendar,
      });
    }
  }

  let checkout;
  try {
    checkout = await getSumUpCheckout(apiKey, checkoutId);
  } catch (error) {
    return {
      checkoutId,
      sumUpStatus: "LOOKUP_FAILED",
      paid: false,
      action: "error",
      bookingStatus: "missing",
      customerEmailSent: false,
      ownerEmailSent: false,
      calendarLogged: false,
      calendarEvents: 0,
      error: error instanceof Error ? error.message : "Could not retrieve SumUp checkout",
    };
  }

  const sumUpStatus = String(checkout.status ?? "UNKNOWN");
  if (!isSumUpCheckoutPaid(checkout)) {
    return {
      checkoutId,
      sumUpStatus,
      paid: false,
      action: "skipped",
      bookingStatus: "pending",
      customerEmailSent: false,
      ownerEmailSent: false,
      calendarLogged: false,
      calendarEvents: 0,
      error: "Payment has not been completed yet",
    };
  }

  const booking = await resolveBookingForCheckout(env, checkoutId, input.clientBooking ?? null);
  if (!booking) {
    return {
      checkoutId,
      sumUpStatus,
      paid: true,
      action: "error",
      bookingStatus: "missing",
      customerEmailSent: false,
      ownerEmailSent: false,
      calendarLogged: false,
      calendarEvents: 0,
      error:
        "SumUp is PAID but no pending booking details were found in KV for this checkout.",
    };
  }

  const result = await finalizePaidCheckout({
    env,
    checkoutId,
    booking,
    checkout,
    logPaidBookingCalendar,
  });

  return mapFinalizeResult(checkoutId, sumUpStatus, result);
}

/**
 * Find PAID-but-unfinalized pending checkouts and finalize them (idempotent).
 * Prefers £1 / TEST checkouts when `preferTestOnePound` is set.
 */
export async function recoverPaidButUnfinalizedCheckouts(input: {
  env: RecoverEnv;
  logPaidBookingCalendar: LogPaidBookingCalendarFn;
  preferTestOnePound?: boolean;
  checkoutId?: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  scanned: number;
  recovered: RecoverCheckoutResult[];
  primary?: RecoverCheckoutResult;
}> {
  const { env, logPaidBookingCalendar } = input;

  if (input.checkoutId?.trim()) {
    const primary = await recoverPaidCheckout({
      env,
      checkoutId: input.checkoutId.trim(),
      logPaidBookingCalendar,
    });
    return {
      ok: primary.action === "finalized" || primary.action === "already_finalized" || primary.action === "calendar_backfill",
      scanned: 1,
      recovered: [primary],
      primary,
    };
  }

  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return { ok: false, scanned: 0, recovered: [] };
  }

  const views = await buildPendingCheckoutOwnerViews(env, { limit: input.limit ?? 40 });
  const candidates = views.filter((v) => v.needsFinalize);

  let ordered = candidates;
  if (input.preferTestOnePound) {
    const testOnes = candidates.filter((v) => Math.abs(v.amount - 1) < 0.001);
    const rest = candidates.filter((v) => Math.abs(v.amount - 1) >= 0.001);
    ordered = [...testOnes, ...rest];
  }

  // Cap work per sweep so cron stays cheap.
  const toRecover = ordered.slice(0, Math.min(input.preferTestOnePound ? 3 : 10, ordered.length));
  const recovered: RecoverCheckoutResult[] = [];

  for (const item of toRecover) {
    recovered.push(
      await recoverPaidCheckout({
        env,
        checkoutId: item.checkoutId,
        logPaidBookingCalendar,
      }),
    );
  }

  const primary =
    recovered.find((r) => r.action === "finalized") ||
    recovered.find((r) => r.action === "already_finalized" || r.action === "calendar_backfill") ||
    recovered[0];

  return {
    ok: Boolean(
      primary &&
        (primary.action === "finalized" ||
          primary.action === "already_finalized" ||
          primary.action === "calendar_backfill"),
    ),
    scanned: views.length,
    recovered,
    primary,
  };
}

export { isLikelyTestOnePound };
