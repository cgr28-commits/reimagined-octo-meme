/**
 * Bespoke (Event / Business Class) quotation payments — Phase 3.
 *
 * STRIPE ONLY (owner decision: "I only use Stripe now"). There is no SumUp
 * fallback for bespoke quotations: if Stripe is not active the customer is asked
 * to contact us. Existing airport SumUp/Stripe behaviour is unchanged.
 *
 * Invariants (each tested in scripts/check-bespoke-payment.ts):
 *  I1  Never two checkouts for one payment attempt; a repeat click reuses it.
 *  I2  A verified payment is ALWAYS recorded in the Durable Object first.
 *  I3  CONFIRMED only after the booking record exists.
 *  I4  Expired / cancelled / mismatched / unexpected / duplicate payments → owner review.
 *  I5  The amount always comes from the Durable Object, never the browser.
 *  I6  Nothing here issues a refund.
 */

import { stripeActiveFor, type PaymentProviderEnv } from "./payment-provider";
import {
  createStripeCheckoutSession,
  expireStripeCheckoutSession,
  isStripeCheckoutId,
  configureStripe,
} from "../shared/stripe-payments";
import {
  getSumUpCheckout,
  isSumUpCheckoutPaid,
  resolveAuthoritativeSumUpTransaction,
  type SumUpCheckoutDetails,
} from "../shared/sumup-checkout";
import { formatPaidAmount, type PaidBookingDetails } from "../shared/booking-notifications";
import {
  BUSINESS_CLASS_REQUEST_SERVICE_LABELS,
  BESPOKE_QUOTE_CATEGORY_LABELS,
  BESPOKE_PAYMENT_REVIEW_REASON_LABELS,
  isBespokeQuoteExpired,
  parseBespokeCheckoutReference,
  type BespokePaymentEntry,
  type BespokeQuoteRecord,
} from "../shared/bespoke-quote";
import {
  buildBespokeBookingConfirmationEmail,
  buildBespokeOwnerPaymentEmail,
  BESPOKE_QUOTATION_PATH,
} from "../shared/bespoke-quote-emails";
import {
  getPendingCheckout,
  pendingCheckoutStoreConfigured,
  savePendingCheckout,
  type PendingCheckoutRecord,
} from "./pending-checkout-store";
import { getPaidBookingRecord, savePaidBookingRecord } from "./paid-booking-store";
import { savePaidBookingRecordFromConfirm } from "./refund-handlers";
import { createTrackingJobForPaidBooking } from "./tracking-handlers";
import { attachCalendarEventIdToTrackingJob, findTrackingJobsByPaymentReference } from "./tracking-store";
import { calendarConfiguredFor, logBespokeBookingCalendar } from "./bespoke-calendar";
import { trySendOwnerOperationalEmail } from "./worker-email";
import { runPaymentOperation, PaymentOperationBusy, paymentOperationHash } from "./payment-operation";
import {
  finalizePaidCheckout,
  resolveBookingForCheckout,
  type FinalizePaidCheckoutResult,
  type LogPaidBookingCalendarFn,
} from "./finalize-paid-checkout";
import {
  applyAction,
  callCoordinator,
  bespokeFeatureEnabled,
  getBespokeQuoteState,
  ownerInbox,
  resolveTokenWithHash,
  sendOnce,
  siteOrigin,
  type BespokeQuoteDeps,
  type BespokeQuoteEnv,
  type BespokeReadyEnv,
} from "./bespoke-quote-handlers";

export type BespokePaymentEnv = BespokeQuoteEnv &
  PaymentProviderEnv & {
    SUMUP_MERCHANT_CODE?: string;
    QUOTE_LEAD_COORDINATOR?: DurableObjectNamespace;
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
    GOOGLE_CALENDAR_ID?: string;
  };

export type BespokePaymentDeps = BespokeQuoteDeps & {
  logPaidBookingCalendar?: LogPaidBookingCalendarFn;
  /** Injectable wait (tests). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (tests). Defaults to real time. */
  now?: () => Date;
};

function nowOf(deps: BespokePaymentDeps): Date {
  return deps.now ? deps.now() : new Date();
}

/** Stripe sessions live up to ~23h; an attempt without a known session id is only released after this. */
const UNKNOWN_SESSION_RELEASE_AFTER_MS = 24 * 60 * 60 * 1000;

function ready(env: BespokePaymentEnv): (BespokePaymentEnv & BespokeReadyEnv) | null {
  return env.BESPOKE_QUOTE_COORDINATOR
    ? ({ ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR } as BespokePaymentEnv & BespokeReadyEnv)
    : null;
}

/** Online payment for bespoke quotations is Stripe only — never SumUp. */
export function bespokeOnlinePaymentAvailable(env: BespokePaymentEnv, customerEmail: string): boolean {
  return stripeActiveFor(env, customerEmail);
}

// ---------------------------------------------------------------------------
// Booking details (used for the pending checkout, Jobs and Calendar)
// ---------------------------------------------------------------------------

export function buildBespokeBookingDetails(record: BespokeQuoteRecord): PaidBookingDetails {
  const j = record.journey;
  const service =
    record.category === "event"
      ? `Event Transfer — ${record.event?.title ?? "event"}`
      : `Business Class — ${record.serviceType ? BUSINESS_CLASS_REQUEST_SERVICE_LABELS[record.serviceType] : "bespoke"}`;
  const vehicle =
    record.owner.vehicleNote?.trim() ||
    (record.category === "business_class"
      ? "Business Class (bespoke)"
      : j.groupVehicleRequested
        ? "Event transfer — group vehicle (as agreed)"
        : "Event transfer (as agreed)");
  return {
    customerName: record.customer.name,
    customerEmail: record.customer.email,
    mobileNumber: record.customer.phone,
    tripLabel: service,
    pickupLabel: j.pickupAddress,
    dropoffLabel: j.destinationAddress,
    ...(j.pickupPlaceId ? { pickupPlaceId: j.pickupPlaceId } : {}),
    ...(j.destinationPlaceId ? { dropoffPlaceId: j.destinationPlaceId } : {}),
    returnJourney: j.returnJourney,
    tripDate: j.date,
    tripTime: j.time,
    returnDate: j.returnJourney ? (j.returnDate ?? "") : "",
    returnTime: j.returnJourney ? (j.returnTime ?? "") : "",
    flightNumber: j.flightNumber ?? "",
    passengers: j.passengers,
    suitcases: 0,
    vehicle,
    // Bespoke jobs are not treated as airport-transfer bookings by flag-based
    // airport automations (flight watch, airport fees).
    isAirportTrip: false,
    // Explicit type, copied onto the paid record AND the tracking job at creation:
    // return-offer emails and airport pickup reminders skip bespoke bookings.
    bookingType: "bespoke",
    bespokeQuoteReference: record.reference,
  };
}

function bookingNotes(record: BespokeQuoteRecord): string {
  const j = record.journey;
  return [
    `Bespoke ${BESPOKE_QUOTE_CATEGORY_LABELS[record.category]} — manually priced quotation ${record.reference} (v${record.quote?.version ?? "?"}).`,
    record.event ? `Event: ${record.event.title}, ${record.event.venue}, ${record.event.date}.` : "",
    j.additionalStops.length ? `Stops: ${j.additionalStops.join("; ")}.` : "",
    j.luggage ? `Luggage: ${j.luggage}.` : "",
    j.specialRequirements ? `Requirements: ${j.specialRequirements}.` : "",
    j.groupVehicleRequested ? "Group / 7-seater requested." : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1500);
}

// ---------------------------------------------------------------------------
// A. Checkout ("Accept and pay")
// ---------------------------------------------------------------------------

export type StartCheckoutResult =
  | { ok: true; paymentUrl: string; checkoutId: string; reused: boolean }
  | { ok: false; status: number; code: string; error: string };

function fail(status: number, code: string, error: string): StartCheckoutResult {
  return { ok: false, status, code, error };
}

export async function startBespokeCheckout(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  token: unknown,
): Promise<StartCheckoutResult> {
  const env = ready(rawEnv);
  if (!env || !bespokeFeatureEnabled(env)) return fail(404, "not_found", "Not found");
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return fail(503, "not_configured", "Online payment is temporarily unavailable. Please contact us.");
  }
  configureStripe(env);
  const resolved = await resolveTokenWithHash(env, token);
  if (!resolved) return fail(404, "not_found", "This quotation link is invalid or no longer available.");
  let record = resolved.record;
  const reference = record.reference;

  if (!bespokeOnlinePaymentAvailable(env, record.customer.email)) {
    return fail(503, "payment_unavailable", "Online payment is not available for this quotation. Please contact us to accept it.");
  }
  if (record.status === "QUOTED" && isBespokeQuoteExpired(record, nowOf(deps))) {
    await applyAction(env, deps, reference, { type: "system_expire" });
    return fail(409, "expired", "This quotation has expired. Please contact us and we will check availability again.");
  }
  // An old attempt that has timed out is reconciled with Stripe first (paid → recorded;
  // unpaid → session expired and released) before a new attempt is allowed.
  if (record.status === "PAYMENT_STARTED" && record.paymentAttempt && Date.parse(record.paymentAttempt.expiresAt) <= nowOf(deps).getTime()) {
    await reconcileBespokeAttempt(rawEnv, deps, reference);
    record = (await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference)).record ?? record;
  }
  if (["PAID", "CONFIRMED", "PAYMENT_REVIEW", "REFUND_REQUIRED"].includes(record.status)) {
    return fail(409, "already_paid", "We have already received a payment for this quotation. Please do not pay again.");
  }
  if (!record.quote) return fail(409, "invalid_status", "This quotation is not available for payment.");

  const begun = await applyAction(env, deps, reference, {
    type: "system_begin_payment",
    quoteVersion: record.quote.version,
    attemptId: crypto.randomUUID(),
    tokenHash: resolved.tokenHash,
  });
  if (!begun.ok) return fail(begun.status === 404 ? 404 : 409, begun.code, begun.error);
  const attempt = begun.record.paymentAttempt;
  if (!attempt?.checkoutReference) return fail(500, "attempt_missing", "Payment could not be started. Please try again.");
  if (attempt.checkoutId && attempt.paymentUrl) {
    return { ok: true, paymentUrl: attempt.paymentUrl, checkoutId: attempt.checkoutId, reused: true };
  }

  // Serialise checkout creation per attempt (existing payment-operation claim): two
  // simultaneous clicks wait for, then reuse, ONE checkout. On failure the claim is
  // released; the retry uses the SAME checkout reference, and Stripe's idempotency
  // key returns the same session (I1).
  const site = siteOrigin(env);
  type CreateOutcome = { ok: true; checkoutId: string; paymentUrl: string } | { ok: false; error: string };
  let created: CreateOutcome;
  try {
    const op = await runPaymentOperation<CreateOutcome>({
      namespace: env.QUOTE_LEAD_COORDINATOR,
      key: `bespoke-checkout:${await paymentOperationHash(attempt.checkoutReference)}`,
      run: async () => {
        try {
          const session = await createStripeCheckoutSession({
            amount: attempt.amountGbp, // I5: from the Durable Object only
            description: `${BESPOKE_QUOTE_CATEGORY_LABELS[begun.record.category]} ${reference}`,
            checkoutReference: attempt.checkoutReference!,
            returnUrl: `${site}${BESPOKE_QUOTATION_PATH}?paid=1`,
            customerEmail: begun.record.customer.email,
            manualCapture: false, // approved: charge immediately
            siteOrigin: site,
            metadata: { bespoke_reference: reference, quote_version: String(attempt.quoteVersion), attempt_id: attempt.attemptId },
          });
          return { ok: true, checkoutId: session.checkoutId, paymentUrl: session.paymentUrl };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "checkout_failed" };
        }
      },
      retrySafe: (result) => !result.ok,
    });
    created = op.result;
  } catch (error) {
    if (error instanceof PaymentOperationBusy) {
      return fail(409, "payment_in_progress", "Your payment is already being prepared. Please wait a moment and try again.");
    }
    throw error;
  }
  if (!created.ok) {
    // The attempt is kept (not released): a retry re-uses the same reference.
    console.error("bespoke checkout creation failed", reference, created.error);
    return fail(503, "checkout_failed", "We couldn't start the payment just now. Please try again in a moment.");
  }

  const booking = buildBespokeBookingDetails(begun.record);
  await savePendingCheckout(env.TRACKING_STORE!, {
    checkoutId: created.checkoutId,
    checkoutReference: attempt.checkoutReference,
    amount: attempt.amountGbp,
    booking,
    createdAt: new Date().toISOString(),
    checkoutKind: "bespoke",
    bespokeQuoteReference: reference,
    paymentMethod: "FULL_ONLINE",
    totalFare: attempt.amountGbp,
    onlineAmountPaid: attempt.amountGbp,
    cashBalanceDue: 0,
  });
  const attached = await applyAction(env, deps, reference, {
    type: "system_attach_checkout",
    attemptId: attempt.attemptId,
    checkoutId: created.checkoutId,
    paymentUrl: created.paymentUrl,
  });
  if (!attached.ok) {
    // e.g. a different checkout already attached (should not happen): never hand
    // out a second payment link.
    const current = (await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference)).record?.paymentAttempt;
    if (current?.checkoutId && current.paymentUrl) {
      return { ok: true, paymentUrl: current.paymentUrl, checkoutId: current.checkoutId, reused: true };
    }
    return fail(409, attached.code, "Payment could not be started. Please contact us.");
  }
  return { ok: true, paymentUrl: created.paymentUrl, checkoutId: created.checkoutId, reused: false };
}

// ---------------------------------------------------------------------------
// B. Finalisation (called from the shared finalizePaidCheckoutOnce hand-off)
// ---------------------------------------------------------------------------

function result(partial: Partial<FinalizePaidCheckoutResult> & { ok: boolean; paid: boolean }): FinalizePaidCheckoutResult {
  return {
    amountPaid: "",
    paymentReference: "",
    emailSent: false,
    customerEmailSent: false,
    ownerEmailSent: false,
    calendarLogged: false,
    calendarEvents: 0,
    trackingCreated: false,
    ...partial,
  };
}

/**
 * Bespoke checkouts only. Runs inside the existing per-checkout payment claim, so
 * the browser return, the Stripe webhook and the recovery sweep cannot interleave.
 * Returns paid:false whenever a retry is needed (the shared wrapper then releases
 * its claim so a later call can finish the work).
 */
export async function finalizeBespokeCheckout(input: {
  env: BespokePaymentEnv;
  checkoutId: string;
  pending: PendingCheckoutRecord;
  checkout?: SumUpCheckoutDetails;
  logPaidBookingCalendar?: LogPaidBookingCalendarFn;
  deps?: BespokePaymentDeps;
}): Promise<FinalizePaidCheckoutResult> {
  // NEVER throw from here: the shared per-checkout payment claim keeps its lock
  // when the work throws (for manual reconciliation), which would block every
  // later retry — including the recovery sweep — for this checkout. A failure
  // instead returns paid:false, which releases the claim so the next call retries.
  try {
    return await finalizeBespokeCheckoutUnsafe(input);
  } catch (error) {
    console.error("bespoke finalize failed; will retry", input.pending.bespokeQuoteReference, error instanceof Error ? error.message : "unknown");
    return result({ ok: false, paid: false, error: "Bespoke payment not yet recorded (temporary error); will retry" });
  }
}

async function finalizeBespokeCheckoutUnsafe(input: {
  env: BespokePaymentEnv;
  checkoutId: string;
  pending: PendingCheckoutRecord;
  checkout?: SumUpCheckoutDetails;
  logPaidBookingCalendar?: LogPaidBookingCalendarFn;
  deps?: BespokePaymentDeps;
}): Promise<FinalizePaidCheckoutResult> {
  const env = ready(input.env);
  const reference = input.pending.bespokeQuoteReference ?? "";
  const deps: BespokePaymentDeps = { ...(input.deps ?? {}), logPaidBookingCalendar: input.logPaidBookingCalendar ?? input.deps?.logPaidBookingCalendar };
  if (!env) return result({ ok: false, paid: false, error: "Bespoke quotes are not configured" });
  configureStripe(env);

  let checkout = input.checkout ?? (await getSumUpCheckout("stripe", input.checkoutId));
  if (!isSumUpCheckoutPaid(checkout)) {
    return result({ ok: false, paid: false, error: "Payment has not been completed yet" });
  }
  const resolved = await resolveAuthoritativeSumUpTransaction({
    apiKey: "stripe",
    merchantCode: env.SUMUP_MERCHANT_CODE,
    checkout,
    paymentReference: checkout.checkout_reference,
  });
  checkout = resolved.checkout;
  const paymentReference = resolved.transactionCode ?? checkout.checkout_reference ?? checkout.id;
  const amountGbp = Number(checkout.amount ?? Number.NaN);
  const amountLabel = formatPaidAmount(Number.isFinite(amountGbp) ? amountGbp : 0, checkout.currency ?? "GBP");
  // A non-GBP or unreadable amount is recorded as £0.00 so it can never match the
  // quote and always goes to owner review (I4).
  const recordedAmount = checkout.currency?.toUpperCase() === "GBP" && Number.isFinite(amountGbp) ? amountGbp : 0;

  // I2: record first, whatever happens next.
  const recorded = await applyAction(env, deps, reference, {
    type: "system_record_payment",
    paymentReference,
    checkoutId: input.checkoutId,
    amountGbp: recordedAmount,
  });
  if (!recorded.ok) {
    console.error("bespoke payment record failed", reference, recorded.code);
    return result({ ok: false, paid: false, error: `Bespoke payment not yet recorded (${recorded.code})` });
  }
  const record = recorded.record;
  const payment = record.payments.find((p) => p.paymentReference === paymentReference);
  if (!payment) return result({ ok: false, paid: false, error: "Bespoke payment not found after recording" });

  if (payment.outcome === "review") {
    await notifyOwnerOfPayment(env, deps, record, payment, "review");
    return result({ ok: true, paid: true, paymentReference, amountPaid: amountLabel, ownerEmailSent: true });
  }
  const booked = await completeBespokeBooking(input.env, deps, reference);
  if (!booked.ok) {
    // Payment is safe in the DO (PAID). paid:false lets the next call retry the booking.
    return result({ ok: false, paid: false, paymentReference, amountPaid: amountLabel, error: `Booking not yet created: ${booked.error}` });
  }
  return result({
    ok: true,
    paid: true,
    paymentReference,
    amountPaid: amountLabel,
    customerReference: booked.bookingReference,
    emailSent: true,
    customerEmailSent: booked.customerEmailAccepted,
    ownerEmailSent: true,
    calendarLogged: booked.calendarEvents > 0,
    calendarEvents: booked.calendarEvents,
    trackingCreated: booked.trackingCreated,
  });
}

async function notifyOwnerOfPayment(
  env: BespokePaymentEnv & BespokeReadyEnv,
  deps: BespokePaymentDeps,
  record: BespokeQuoteRecord,
  payment: BespokePaymentEntry,
  outcome: "review" | "booking_pending" | "confirmed",
): Promise<void> {
  const key = `owner_payment_${outcome}:${payment.paymentReference}`.replace(/[^A-Za-z0-9:_-]/g, "-").slice(0, 120);
  await sendOnce(env, deps, record.reference, key, `owner_payment_${outcome}`, "owner", () => ({
    ...buildBespokeOwnerPaymentEmail(
      record,
      {
        outcome,
        paymentReference: payment.paymentReference,
        amountPaidGbp: payment.amountGbp,
        bookingReference: record.bookingReference,
        reviewReasons: payment.reviewReasons?.map((r) => BESPOKE_PAYMENT_REVIEW_REASON_LABELS[r]),
      },
      `${siteOrigin(env)}/owner/`,
    ),
    to: ownerInbox(env),
  })).catch((error) => console.error("bespoke owner payment email failed", error instanceof Error ? error.message : "unknown"));
}

// ---------------------------------------------------------------------------
// Booking creation (Jobs + Calendar), then CONFIRMED (I3)
// ---------------------------------------------------------------------------

export type CompleteBookingResult =
  | { ok: true; bookingReference: string; calendarEvents: number; trackingCreated: boolean; customerEmailAccepted: boolean }
  | { ok: false; error: string };

/**
 * Idempotent. Called after an accepted payment, on retries, and after the owner
 * accepts a reviewed payment. Each step is safe to repeat:
 *  1. paid booking record (MAT reference claimed once per payment reference)
 *  2. tracking job → Owner Jobs (de-duplicated by payment reference)
 *  3. Google Calendar (only if the record has no calendar events yet)
 *  4. DO system_mark_booked → CONFIRMED (only now)
 *  5. confirmation + owner emails (once-only keys)
 */
export async function completeBespokeBooking(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  reference: string,
): Promise<CompleteBookingResult> {
  const env = ready(rawEnv);
  if (!env || !env.TRACKING_STORE) return { ok: false, error: "not_configured" };
  // Exclusive, EXPIRING lease on this quotation: two simultaneous recoveries can
  // never create the booking twice, and a Worker that crashed mid-way only blocks
  // others until the lease expires (unlike a permanent lock).
  const token = crypto.randomUUID();
  const lease = await callCoordinator<{ acquired?: boolean }>(env.BESPOKE_QUOTE_COORDINATOR, `quote:${reference}`, "lease", {
    name: "booking",
    token,
    ttlMs: BOOKING_LEASE_MS,
  }).catch(() => ({ acquired: false }));
  if (!lease.acquired) return { ok: false, error: "booking_in_progress" };
  try {
    return await completeBespokeBookingLeased(env, deps, reference);
  } finally {
    await callCoordinator(env.BESPOKE_QUOTE_COORDINATOR, `quote:${reference}`, "lease-release", { name: "booking", token }).catch(() => undefined);
  }
}

const BOOKING_LEASE_MS = 5 * 60_000;

async function completeBespokeBookingLeased(
  env: BespokePaymentEnv & BespokeReadyEnv,
  deps: BespokePaymentDeps,
  reference: string,
): Promise<CompleteBookingResult> {
  if (!env.TRACKING_STORE) return { ok: false, error: "not_configured" };
  const state = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference);
  const record = state.record;
  if (!record) return { ok: false, error: "not_found" };
  const payment = [...record.payments].reverse().find((p) => p.outcome === "accepted" && !p.refundedManuallyAt);
  if (!payment) return { ok: false, error: "no_accepted_payment" };
  if (record.status !== "PAID" && record.status !== "CONFIRMED") return { ok: false, error: `status_${record.status}` };

  const booking = buildBespokeBookingDetails(record);
  const amountLabel = formatPaidAmount(payment.amountGbp);
  const store = env.TRACKING_STORE;
  let bookingReference = record.bookingReference ?? "";
  let calendarEvents = 0;
  let trackingCreated = false;
  let calendarUncertain: string | undefined;
  let pendingCalendarFinish: { status: "accepted"; provider: string } | undefined;

  if (record.status === "PAID") {
    try {
      const existing = await getPaidBookingRecord(store, payment.paymentReference);
      const base = {
        env: env as never,
        booking,
        checkoutId: payment.checkoutId ?? "",
        amount: payment.amountGbp,
        currency: "GBP",
        amountPaidLabel: amountLabel,
        paymentReference: payment.paymentReference,
        paymentMethod: "FULL_ONLINE" as const,
        totalFare: payment.amountGbp,
        onlineAmountPaid: payment.amountGbp,
        cashBalanceDue: 0,
      };
      // 1. Booking record first, so it exists before anything can mark it confirmed.
      const customerReference = await savePaidBookingRecordFromConfirm({
        ...base,
        trackingToken: existing?.trackingToken,
        calendarEventIds: existing?.calendarEventIds ?? [],
        ...(existing?.calendarEventIdsByLeg ? { calendarEventIdsByLeg: existing.calendarEventIdsByLeg } : {}),
      });
      // 2. Jobs.
      const tracking = await createTrackingJobForPaidBooking(env as never, booking, payment.paymentReference);
      trackingCreated = tracking.created;
      // 3. Calendar — duplicate-safe (event id derived from the payment reference).
      //    A calendar problem never blocks or un-confirms a paid booking: it is
      //    flagged to the owner, who can retry safely (same id → no duplicate).
      let calendarIds = existing?.calendarEventIds ?? [];
      let byLeg = existing?.calendarEventIdsByLeg;
      if (calendarIds.length === 0) {
        // Claimed ONCE per payment in the Durable Object. Google documents that it
        // "cannot guarantee that ID collisions will be detected at event creation
        // time", so after an uncertain insert we never retry automatically: the
        // claim stays and the owner reviews (Retry calendar looks up first).
        const step = await claimCalendarStep(env, reference, payment.paymentReference);
        if (step.claimed) {
          const calendar = await logBespokeBookingCalendar(env, booking, amountLabel, payment.paymentReference).catch(
            (error: unknown) => ({ status: "uncertain" as const, eventIds: [] as string[], error: error instanceof Error ? error.message : "calendar error" }),
          );
          if (calendar.status === "logged") {
            calendarIds = calendar.eventIds;
            byLeg = calendar.byLeg;
            pendingCalendarFinish = { status: "accepted", provider: "google-calendar" };
          } else if (calendar.status === "uncertain") {
            calendarUncertain = calendar.error;
            await finishCalendarStep(env, reference, payment.paymentReference, { status: "failed", error: calendar.error });
          } else {
            await finishCalendarStep(env, reference, payment.paymentReference, { status: "skipped", error: "calendar not configured" });
          }
        } else if (step.status !== "accepted" && step.status !== "skipped") {
          // An earlier attempt is uncertain (or crashed mid-way): owner review only.
          calendarUncertain = calendarUncertain ?? "an earlier calendar attempt did not complete";
        }
      }
      calendarEvents = calendarIds.length;
      await savePaidBookingRecordFromConfirm({
        ...base,
        trackingToken: tracking.token ?? existing?.trackingToken,
        calendarEventIds: calendarIds,
        ...(byLeg ? { calendarEventIdsByLeg: byLeg } : {}),
      });
      if (byLeg) {
        for (const job of await findTrackingJobsByPaymentReference(store, payment.paymentReference)) {
          const eventId = job.journeyLeg === "return" ? byLeg.return : byLeg.outbound;
          if (eventId) await attachCalendarEventIdToTrackingJob(store, job.token, eventId);
        }
      }
      const saved = await getPaidBookingRecord(store, payment.paymentReference);
      if (!saved) throw new Error("paid booking record not readable after save");
      // Only now (event ids stored) is the calendar step marked done.
      if (pendingCalendarFinish) await finishCalendarStep(env, reference, payment.paymentReference, pendingCalendarFinish);
      const notes = bookingNotes(record);
      if (saved.notes !== notes) await savePaidBookingRecord(store, { ...saved, notes });
      bookingReference = customerReference || saved.customerReference || payment.paymentReference;
    } catch (error) {
      const message = error instanceof Error ? error.message : "booking_failed";
      console.error("bespoke booking creation failed", reference, message);
      await notifyOwnerOfPayment(env, deps, record, payment, "booking_pending");
      return { ok: false, error: message };
    }

    // 4. CONFIRMED only now (I3).
    const marked = await applyAction(env, deps, reference, { type: "system_mark_booked", bookingReference });
    if (!marked.ok) return { ok: false, error: `mark_booked_${marked.code}` };
  }

  if (calendarUncertain) {
    await notifyOwnerOfCalendarProblem(env, deps, record, payment, calendarUncertain);
  }

  // 5. Emails, once each.
  const latest = (await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference)).record ?? record;
  bookingReference = latest.bookingReference ?? bookingReference;
  const customerEmail = await sendOnce(env, deps, reference, `confirmation:v${latest.quote?.version ?? 0}`, "booking_confirmation", "customer", () => ({
    ...buildBespokeBookingConfirmationEmail(latest, { bookingReference, amountPaidGbp: payment.amountGbp }),
    to: latest.customer.email,
    toName: latest.customer.name,
  })).catch(() => ({ status: "failed" as const }));
  await notifyOwnerOfPayment(env, deps, latest, payment, "confirmed");
  return {
    ok: true,
    bookingReference,
    calendarEvents,
    trackingCreated,
    customerEmailAccepted: customerEmail.status === "accepted",
  };
}

// ---------------------------------------------------------------------------
// C. Recovery
// ---------------------------------------------------------------------------

/** Run the SHARED finaliser for a bespoke checkout (keeps its per-checkout claim). */
export async function finalizeBespokeCheckoutViaSharedPath(
  env: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  checkoutId: string,
): Promise<FinalizePaidCheckoutResult | null> {
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) return null;
  const pending = await getPendingCheckout(env.TRACKING_STORE, checkoutId);
  if (pending?.checkoutKind !== "bespoke") return null;
  const booking = await resolveBookingForCheckout(env as never, checkoutId, null);
  if (!booking) return null;
  configureStripe(env);
  return finalizePaidCheckout({
    env: env as never,
    checkoutId,
    booking,
    logPaidBookingCalendar: deps.logPaidBookingCalendar ?? noCalendar,
  });
}

const noCalendar: LogPaidBookingCalendarFn = async () => ({ logged: false, eventIds: [] }) as never;

export type ReconcileOutcome = "paid" | "released" | "wait" | "nothing";

/**
 * A timed-out checkout attempt: ask Stripe what happened.
 *  - paid      → finalised through the shared path (recorded, booked or reviewed)
 *  - unpaid    → the Stripe session is EXPIRED first (so it can never be paid
 *                later), then the attempt is released
 *  - unknown session id (crash before it was stored) → released only after 24h,
 *    when any Stripe session for it has certainly expired
 */
export async function reconcileBespokeAttempt(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  reference: string,
): Promise<ReconcileOutcome> {
  const env = ready(rawEnv);
  if (!env) return "nothing";
  configureStripe(env);
  const record = (await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference)).record;
  const attempt = record?.paymentAttempt;
  if (!record || !attempt || record.status !== "PAYMENT_STARTED") return "nothing";
  const nowMs = nowOf(deps).getTime();
  if (Date.parse(attempt.expiresAt) > nowMs) return "wait";

  const release = async (reason: string): Promise<ReconcileOutcome> => {
    const released = await applyAction(env, deps, reference, { type: "system_release_payment_attempt", attemptId: attempt.attemptId, reason });
    return released.ok ? "released" : "wait";
  };

  if (!attempt.checkoutId) {
    return nowMs - Date.parse(attempt.startedAt) >= UNKNOWN_SESSION_RELEASE_AFTER_MS
      ? release("no checkout created / unknown session; past Stripe session lifetime")
      : "wait";
  }
  if (!isStripeCheckoutId(attempt.checkoutId)) return "wait"; // bespoke never creates non-Stripe checkouts

  const checkout = await getSumUpCheckout("stripe", attempt.checkoutId).catch(() => null);
  if (!checkout) return "wait";
  if (isSumUpCheckoutPaid(checkout)) {
    return (await finalizeAndConfirmRecorded(env, deps, reference, attempt.checkoutId)) ? "paid" : "wait";
  }
  if (checkout.status === "PENDING") {
    try {
      await expireStripeCheckoutSession(attempt.checkoutId);
    } catch {
      // Expiry refused — most likely completed meanwhile. Re-check and finalise.
      const again = await getSumUpCheckout("stripe", attempt.checkoutId).catch(() => null);
      if (again && isSumUpCheckoutPaid(again)) {
        return (await finalizeAndConfirmRecorded(env, deps, reference, attempt.checkoutId)) ? "paid" : "wait";
      }
      return "wait";
    }
  }
  return release("checkout not paid; Stripe session expired");
}

/** Owner cancelled while the customer was at checkout: close the Stripe session (best effort). */
export async function expireBespokeCheckoutAfterCancel(env: BespokePaymentEnv, record: BespokeQuoteRecord): Promise<void> {
  const checkoutId = record.paymentAttempt?.checkoutId;
  if (!checkoutId || !isStripeCheckoutId(checkoutId)) return;
  configureStripe(env);
  await expireStripeCheckoutSession(checkoutId).catch((error) =>
    console.error("bespoke cancel: Stripe session expiry failed", record.reference, error instanceof Error ? error.message : "unknown"),
  );
}

/**
 * Webhook fallback (approved shared change #3): a paid Stripe session with no
 * pending record (crash between creating the session and storing it). The
 * session's client_reference_id identifies the quotation; the payment is
 * recorded and — because the DO never saw this checkout — goes to owner review.
 * Returns true when the checkout belonged to a bespoke quotation.
 */
export async function handleOrphanBespokePayment(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  checkoutId: string,
): Promise<boolean> {
  const env = ready(rawEnv);
  if (!env || !isStripeCheckoutId(checkoutId)) return false;
  configureStripe(env);
  const checkout = await getSumUpCheckout("stripe", checkoutId).catch(() => null);
  const parsed = parseBespokeCheckoutReference(checkout?.checkout_reference);
  if (!checkout || !parsed) return false;
  if (!isSumUpCheckoutPaid(checkout)) return true;
  const resolved = await resolveAuthoritativeSumUpTransaction({ apiKey: "stripe", checkout, paymentReference: checkout.checkout_reference });
  const paymentReference = resolved.transactionCode ?? resolved.checkout.checkout_reference ?? checkoutId;
  const amount = Number(resolved.checkout.amount ?? Number.NaN);
  const recorded = await applyAction(env, deps, parsed.reference, {
    type: "system_record_payment",
    paymentReference,
    checkoutId,
    amountGbp: resolved.checkout.currency?.toUpperCase() === "GBP" && Number.isFinite(amount) ? amount : 0,
  });
  if (recorded.ok) {
    const payment = recorded.record.payments.find((p) => p.paymentReference === paymentReference);
    if (payment?.outcome === "review") await notifyOwnerOfPayment(env, deps, recorded.record, payment, "review");
    else if (payment?.outcome === "accepted") await completeBespokeBooking(rawEnv, deps, parsed.reference);
  } else {
    console.error("bespoke orphan payment record failed", parsed.reference, recorded.code);
  }
  return true;
}

async function notifyOwnerOfCalendarProblem(
  env: BespokePaymentEnv & BespokeReadyEnv,
  deps: BespokePaymentDeps,
  record: BespokeQuoteRecord,
  payment: BespokePaymentEntry,
  detail: string,
): Promise<void> {
  const key = `owner_calendar:${payment.paymentReference}`.replace(/[^A-Za-z0-9:_-]/g, "-").slice(0, 120);
  await sendOnce(env, deps, record.reference, key, "owner_calendar_problem", "owner", () => ({
    subject: `Check the calendar — ${record.reference}`,
    text: [
      `The booking for ${record.reference} is paid and confirmed, but adding it to Google Calendar could not be confirmed (${detail}).`,
      "No duplicate will be created: use 'Retry calendar' in Owner Dashboard → More → Event & Business Class.",
    ].join("\n"),
    html: `<p>The booking for ${record.reference} is paid and confirmed, but adding it to Google Calendar could not be confirmed.</p><p>No duplicate will be created: use <strong>Retry calendar</strong> in Owner Dashboard → More → Event &amp; Business Class.</p>`,
    to: ownerInbox(env),
  })).catch(() => undefined);
}

export type CalendarStatus = { configured: boolean; paymentReference?: string; eventIds: string[] };

/** Owner detail: is the confirmed booking in the calendar? */
export async function bespokeCalendarStatus(rawEnv: BespokePaymentEnv, record: BespokeQuoteRecord): Promise<CalendarStatus> {
  const payment = [...record.payments].reverse().find((p) => p.outcome === "accepted" && !p.refundedManuallyAt);
  if (!rawEnv.TRACKING_STORE || !payment || record.status !== "CONFIRMED") {
    return { configured: calendarConfiguredFor(rawEnv), eventIds: [] };
  }
  const paid = await getPaidBookingRecord(rawEnv.TRACKING_STORE, payment.paymentReference);
  return { configured: calendarConfiguredFor(rawEnv), paymentReference: payment.paymentReference, eventIds: paid?.calendarEventIds ?? [] };
}

/**
 * Owner "Retry calendar": safe to repeat — the event id is derived from the
 * payment reference, so an event that already exists is found and reused.
 */
export async function retryBespokeCalendar(
  rawEnv: BespokePaymentEnv,
  record: BespokeQuoteRecord,
  clickKey: string = crypto.randomUUID(),
): Promise<{ ok: boolean; status: string; eventIds: string[] }> {
  if (!rawEnv.TRACKING_STORE || record.status !== "CONFIRMED") return { ok: false, status: "not_confirmed", eventIds: [] };
  const env = ready(rawEnv);
  if (!env) return { ok: false, status: "not_configured", eventIds: [] };
  // One owner click = one attempt (a double-click or network retry does nothing more).
  const stepKey = `calendar-retry:${clickKey}`.replace(/[^A-Za-z0-9:_-]/g, "-").slice(0, 120);
  const claim = await callCoordinator<{ claimed?: boolean }>(env.BESPOKE_QUOTE_COORDINATOR, `quote:${record.reference}`, "notify-begin", {
    key: stepKey,
    kind: "calendar",
  }).catch(() => ({ claimed: false }));
  if (!claim.claimed) return { ok: false, status: "already_requested", eventIds: [] };
  const outcome = await retryBespokeCalendarClaimed(rawEnv, record);
  await callCoordinator(env.BESPOKE_QUOTE_COORDINATOR, `quote:${record.reference}`, "notify-finish", {
    key: stepKey,
    status: outcome.ok ? "accepted" : outcome.status === "not_configured" ? "skipped" : "failed",
    ...(outcome.ok ? { provider: "google-calendar" } : { error: outcome.status }),
  }).catch(() => undefined);
  return outcome;
}

async function retryBespokeCalendarClaimed(
  rawEnv: BespokePaymentEnv,
  record: BespokeQuoteRecord,
): Promise<{ ok: boolean; status: string; eventIds: string[] }> {
  if (!rawEnv.TRACKING_STORE) return { ok: false, status: "not_configured", eventIds: [] };
  const payment = [...record.payments].reverse().find((p) => p.outcome === "accepted" && !p.refundedManuallyAt);
  if (!payment) return { ok: false, status: "no_payment", eventIds: [] };
  const store = rawEnv.TRACKING_STORE;
  const paid = await getPaidBookingRecord(store, payment.paymentReference);
  if (!paid) return { ok: false, status: "no_booking_record", eventIds: [] };
  if ((paid.calendarEventIds ?? []).length > 0) return { ok: true, status: "already_logged", eventIds: paid.calendarEventIds ?? [] };
  const calendar = await logBespokeBookingCalendar(rawEnv, buildBespokeBookingDetails(record), formatPaidAmount(payment.amountGbp), payment.paymentReference).catch(
    (error: unknown) => ({ status: "uncertain" as const, eventIds: [] as string[], error: error instanceof Error ? error.message : "calendar error" }),
  );
  if (calendar.status !== "logged") return { ok: false, status: calendar.status, eventIds: [] };
  await savePaidBookingRecord(store, { ...paid, calendarEventIds: calendar.eventIds, calendarEventIdsByLeg: calendar.byLeg });
  for (const job of await findTrackingJobsByPaymentReference(store, payment.paymentReference)) {
    const eventId = job.journeyLeg === "return" ? calendar.byLeg.return : calendar.byLeg.outbound;
    if (eventId) await attachCalendarEventIdToTrackingJob(store, job.token, eventId);
  }
  return { ok: true, status: "logged", eventIds: calendar.eventIds };
}

// ---------------------------------------------------------------------------
// D. Cancelled while at checkout — settle with Stripe before forgetting it
// ---------------------------------------------------------------------------

/**
 * The owner cancelled (or declined) while a Stripe session was open. Cancel tries
 * to expire the session, but if the customer was paying at that moment the
 * expiry fails and the payment completes. If the webhook's processing then fails
 * (the route still answers 200, so Stripe never retries), nothing else would
 * look at this request again. The sweep keeps it listed until Stripe settles it:
 *   paid    → recorded (→ owner review: paid after cancellation)
 *   open    → session expired now, then the attempt is closed
 *   expired → attempt closed
 */
export async function reconcileCancelledCheckout(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  reference: string,
): Promise<"paid" | "closed" | "wait" | "nothing"> {
  const env = ready(rawEnv);
  if (!env) return "nothing";
  configureStripe(env);
  const record = (await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference)).record;
  const attempt = record?.paymentAttempt;
  if (!record || !attempt || !["CANCELLED", "DECLINED"].includes(record.status)) return "nothing";
  const close = async (reason: string) => {
    const closed = await applyAction(env, deps, reference, { type: "system_close_cancelled_attempt", attemptId: attempt.attemptId, reason });
    return closed.ok ? ("closed" as const) : ("wait" as const);
  };
  if (!attempt.checkoutId || !isStripeCheckoutId(attempt.checkoutId)) {
    return nowOf(deps).getTime() - Date.parse(attempt.startedAt) >= UNKNOWN_SESSION_RELEASE_AFTER_MS
      ? close("cancelled; no checkout session known; past Stripe session lifetime")
      : "wait";
  }
  const checkout = await getSumUpCheckout("stripe", attempt.checkoutId).catch(() => null);
  if (!checkout) return "wait";
  if (isSumUpCheckoutPaid(checkout)) {
    return (await finalizeAndConfirmRecorded(env, deps, reference, attempt.checkoutId)) ? "paid" : "wait";
  }
  if (checkout.status === "PENDING") {
    try {
      await expireStripeCheckoutSession(attempt.checkoutId);
    } catch {
      const again = await getSumUpCheckout("stripe", attempt.checkoutId).catch(() => null);
      if (again && isSumUpCheckoutPaid(again)) {
        return (await finalizeAndConfirmRecorded(env, deps, reference, attempt.checkoutId)) ? "paid" : "wait";
      }
      return "wait";
    }
  }
  return close("cancelled; Stripe session expired unpaid");
}

// ---------------------------------------------------------------------------
// E. Stripe backstop — Stripe itself is the source of truth
// ---------------------------------------------------------------------------

export type StripeBackstopResult = {
  ran: boolean;
  /** True only if the WHOLE window was listed and every bespoke session handled. */
  complete: boolean;
  pages: number;
  sessionsChecked: number;
  bespokeSessions: number;
  recovered: number;
  asyncPending: number;
  errors: number;
  windowStart?: number;
  checkpoint?: number | null;
};

/** Larger than Stripe's maximum Checkout Session lifetime (24 h), plus margin. */
export const BACKSTOP_OVERLAP_SECONDS = 26 * 3600;
/** First ever run looks back this far. */
export const BACKSTOP_INITIAL_LOOKBACK_SECONDS = 30 * 86400;
const BACKSTOP_CHECKPOINT = "backstop:checkpoint";
const BACKSTOP_STALE_ALERT_SECONDS = 6 * 3600;
const ASYNC_PENDING_GIVE_UP_SECONDS = 14 * 86400;

async function stripeGet(url: string, key: string, deps: BespokePaymentDeps): Promise<Response | null> {
  // 429 / 5xx / network: retry with backoff (honouring Retry-After, capped).
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    } catch {
      response = null;
    }
    if (response && response.ok) return response;
    if (response && response.status !== 429 && response.status < 500) return null; // not retryable
    const retryAfter = Number(response?.headers.get("Retry-After") ?? "");
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 500 * 2 ** attempt;
    await (deps.sleep ? deps.sleep(waitMs) : new Promise((r) => setTimeout(r, waitMs)));
  }
  return null;
}

/**
 * Hourly: make sure every bespoke Stripe payment is recorded, using Stripe itself
 * as the source of truth (independent of our pending records, registry and index).
 *
 * Correctness:
 *  - Stripe's list endpoint filters by session CREATION time ("created") and status;
 *    it cannot filter by client_reference_id, so bespoke "bq-" sessions are picked
 *    client-side. A session can be paid up to ~24 h after creation, so each run
 *    searches from (checkpoint − 26 h): any session completed after the checkpoint
 *    is inside the window.
 *  - The checkpoint is DURABLE and advances only when the whole window was listed
 *    (all pages) and every bespoke session was handled. Any failure (Stripe down,
 *    rate limits after retries, page cap, a recording error) leaves it unchanged,
 *    so the next run re-covers the same ground — nothing is skipped.
 *  - Completed-but-unpaid sessions (async payment methods) are kept in a durable
 *    list and re-checked by id until paid or failed.
 *  - If the checkpoint falls more than 6 h behind, the owner is alerted (daily).
 * Read-only towards Stripe (GET). Airport sessions are ignored. Idempotent.
 */
export async function runBespokeStripeBackstop(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  options: { maxPages?: number } = {},
): Promise<StripeBackstopResult> {
  const result: StripeBackstopResult = { ran: false, complete: false, pages: 0, sessionsChecked: 0, bespokeSessions: 0, recovered: 0, asyncPending: 0, errors: 0 };
  const env = ready(rawEnv);
  const key = String(rawEnv.STRIPE_SECRET_KEY ?? "").trim();
  if (!env || !key || !bespokeFeatureEnabled(env)) return result;
  configureStripe(env);
  result.ran = true;
  const ns = env.BESPOKE_QUOTE_COORDINATOR;
  const runStart = Math.floor(nowOf(deps).getTime() / 1000);
  const state = await callCoordinator<{ checkpoint: number | null; pending: Record<string, number> }>(ns, BACKSTOP_CHECKPOINT, "checkpoint", {});
  result.checkpoint = state.checkpoint;
  const since = (state.checkpoint ?? runStart - BACKSTOP_INITIAL_LOOKBACK_SECONDS) - BACKSTOP_OVERLAP_SECONDS;
  result.windowStart = since;
  let ok = true;
  const addPending: string[] = [];
  const removePending: string[] = [];

  const handle = async (sessionId: string, clientReference: string | null | undefined): Promise<"recorded" | "pending" | "failed" | "ignored"> => {
    const parsed = parseBespokeCheckoutReference(clientReference);
    if (!parsed) return "ignored";
    result.bespokeSessions += 1;
    const recorded = async () =>
      Boolean((await getBespokeQuoteState(ns, parsed.reference)).record?.payments.some((p) => p.checkoutId === sessionId));
    if (await recorded()) return "recorded";
    const checkout = await getSumUpCheckout("stripe", sessionId).catch(() => null);
    if (!checkout) return "failed";
    if (!isSumUpCheckoutPaid(checkout)) return checkout.status === "EXPIRED" ? "ignored" : "pending";
    await finalizeBespokeDirect(env, deps, sessionId).catch(() => false);
    if (await recorded()) {
      result.recovered += 1;
      return "recorded";
    }
    return "failed";
  };

  // 1. Re-check async-pending sessions by id (they may sit outside the window).
  for (const [sessionId, firstSeen] of Object.entries(state.pending ?? {})) {
    const session = await stripeGet(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, key, deps);
    if (!session) {
      ok = false;
      result.errors += 1;
      continue;
    }
    const body = (await session.json()) as { id?: string; client_reference_id?: string | null; payment_status?: string; payment_intent?: unknown };
    const outcome = await handle(sessionId, body.client_reference_id).catch(() => "failed" as const);
    if (outcome === "recorded" || outcome === "ignored") removePending.push(sessionId);
    else if (outcome === "pending") {
      result.asyncPending += 1;
      if (runStart - firstSeen > ASYNC_PENDING_GIVE_UP_SECONDS) removePending.push(sessionId);
    } else {
      ok = false;
      result.errors += 1;
    }
  }

  // 2. List every completed session in the overlapping window (all pages).
  let startingAfter = "";
  const maxPages = options.maxPages ?? 50;
  for (;;) {
    if (result.pages >= maxPages) {
      ok = false; // more data than one run may process — do NOT advance, never skip
      result.errors += 1;
      break;
    }
    const url = new URL("https://api.stripe.com/v1/checkout/sessions");
    url.searchParams.set("status", "complete");
    url.searchParams.set("limit", "100");
    url.searchParams.set("created[gte]", String(since));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);
    const response = await stripeGet(url.toString(), key, deps);
    if (!response) {
      ok = false;
      result.errors += 1;
      break;
    }
    result.pages += 1;
    const list = (await response.json()) as { data?: Array<{ id?: string; client_reference_id?: string | null }>; has_more?: boolean };
    for (const session of list.data ?? []) {
      result.sessionsChecked += 1;
      if (!session.id || !isStripeCheckoutId(session.id)) continue;
      const outcome = await handle(session.id, session.client_reference_id).catch(() => "failed" as const);
      if (outcome === "pending") {
        result.asyncPending += 1;
        addPending.push(session.id);
      } else if (outcome === "failed") {
        ok = false;
        result.errors += 1;
      }
    }
    const last = list.data?.[list.data.length - 1]?.id;
    if (!list.has_more) break;
    if (!last) {
      ok = false;
      result.errors += 1;
      break;
    }
    startingAfter = last;
  }

  // 3. Persist: pending list always; checkpoint ONLY after a complete, clean run.
  const saved = await callCoordinator<{ checkpoint: number | null }>(ns, BACKSTOP_CHECKPOINT, "checkpoint", {
    ...(ok ? { set: runStart } : {}),
    addPending,
    removePending,
  }).catch(() => null);
  result.complete = ok && Boolean(saved);
  result.checkpoint = saved?.checkpoint ?? state.checkpoint;

  // 4. Falling behind? Tell the owner (once per day).
  const behind = runStart - (result.checkpoint ?? runStart);
  if (!result.complete && result.checkpoint !== null && result.checkpoint !== undefined && behind > BACKSTOP_STALE_ALERT_SECONDS) {
    const day = new Date(runStart * 1000).toISOString().slice(0, 10);
    const claim = await callCoordinator<{ claimed?: boolean }>(ns, `backstop-alert:${day}`, "claim", { value: "alert", ttlSeconds: 36 * 3600 }).catch(() => ({ claimed: false }));
    if (claim.claimed) {
      await (deps.sendOwnerEmail ?? trySendOwnerOperationalEmail)(env, {
        to: ownerInbox(env),
        subject: "ACTION NEEDED — bespoke payment reconciliation is behind",
        body: `The hourly Stripe check for Event / Business Class payments has not completed for ${Math.round(behind / 3600)} hours. Payments are not lost (it resumes from the same point), but please check Stripe and the Owner Dashboard.`,
      }).catch(() => undefined);
    }
  }
  return result;
}

/** Finalise through the shared path, then confirm the payment really is recorded. */
async function finalizeAndConfirmRecorded(
  env: BespokePaymentEnv & BespokeReadyEnv,
  deps: BespokePaymentDeps,
  reference: string,
  checkoutId: string,
): Promise<boolean> {
  const recorded = async () =>
    Boolean((await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference)).record?.payments.some((p) => p.checkoutId === checkoutId));
  await finalizeBespokeCheckoutViaSharedPath(env, deps, checkoutId).catch(() => null);
  if (await recorded()) return true;
  // Shared lock busy or stuck (e.g. a Worker killed inside it): finish directly.
  await finalizeBespokeDirect(env, deps, checkoutId).catch(() => false);
  return recorded();
}

// ---------------------------------------------------------------------------
// Calendar step bookkeeping (once-only, in the quote's Durable Object)
// ---------------------------------------------------------------------------

function calendarStepKey(paymentReference: string): string {
  return `calendar:${paymentReference}`.replace(/[^A-Za-z0-9:_-]/g, "-").slice(0, 120);
}

async function claimCalendarStep(
  env: BespokeReadyEnv,
  reference: string,
  paymentReference: string,
): Promise<{ claimed: boolean; status?: string }> {
  const res = await callCoordinator<{ claimed?: boolean; entry?: { status?: string } }>(
    env.BESPOKE_QUOTE_COORDINATOR,
    `quote:${reference}`,
    "notify-begin",
    { key: calendarStepKey(paymentReference), kind: "calendar" },
  );
  return { claimed: res.claimed === true, status: res.entry?.status };
}

async function finishCalendarStep(
  env: BespokeReadyEnv,
  reference: string,
  paymentReference: string,
  outcome: { status: "accepted" | "failed" | "skipped"; error?: string; provider?: string },
): Promise<void> {
  await callCoordinator(env.BESPOKE_QUOTE_COORDINATOR, `quote:${reference}`, "notify-finish", {
    key: calendarStepKey(paymentReference),
    ...outcome,
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Direct recovery (does not depend on the shared payment lock)
// ---------------------------------------------------------------------------

/**
 * Recovery paths (sweep, Stripe backstop, payment-status fallback) finalise a
 * bespoke checkout WITHOUT the shared per-checkout lock. That lock has no expiry by
 * design, so a Worker killed inside it would otherwise block recovery forever.
 * This is safe because recording is idempotent per payment reference in the
 * Durable Object, booking creation holds the expiring booking lease, and every
 * email is a once-only notification.
 */
export async function finalizeBespokeDirect(
  rawEnv: BespokePaymentEnv,
  deps: BespokePaymentDeps,
  checkoutId: string,
): Promise<boolean> {
  const env = ready(rawEnv);
  if (!env || !isStripeCheckoutId(checkoutId)) return false;
  const pending = env.TRACKING_STORE ? await getPendingCheckout(env.TRACKING_STORE, checkoutId).catch(() => null) : null;
  if (pending?.checkoutKind === "bespoke" && pending.bespokeQuoteReference) {
    const r = await finalizeBespokeCheckout({ env, checkoutId, pending, deps });
    return r.paid;
  }
  return handleOrphanBespokePayment(env, deps, checkoutId);
}
