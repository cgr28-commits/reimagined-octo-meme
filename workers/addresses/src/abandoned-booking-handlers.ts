/**
 * Abandoned booking recovery — capture, cron reminder, resume lookup, owner list, opt-out.
 */

import {
  abandonedBookingStatusLabel,
  buildAbandonedBookingRecoveryUrl,
  normalizeAbandonedBookingToken,
  normalizeEmail,
  resolveAbandonedBookingDelayMs,
  shouldSendAbandonedBookingReminder,
  toAbandonedBookingOwnerView,
  type AbandonedBookingJourneySnapshot,
  type AbandonedBookingPublicResume,
  type AbandonedBookingRecord,
} from "../shared/abandoned-booking-recovery";
import { buildAbandonedBookingRecoveryEmail } from "../shared/abandoned-booking-recovery-emails";
import { isSumUpCheckoutPaid, getSumUpCheckout } from "../shared/sumup-checkout";
import { ownerAuthorized } from "./driver-auth";
import {
  getPaidBookingRecordByCheckoutId,
  paidBookingStoreConfigured,
} from "./paid-booking-store";
import { getPendingCheckout } from "./pending-checkout-store";
import { trySendBrandedCustomerEmail } from "./worker-email";
import {
  clearAbandonedBookingReminderClaim,
  createOrUpdateAbandonedBooking,
  getAbandonedBookingByToken,
  isAbandonedBookingEmailOptedOut,
  listAbandonedBookingsForOwner,
  listOpenAbandonedBookingTokens,
  markAbandonedBookingExpiredIfNeeded,
  markAbandonedBookingOptedOut,
  markAbandonedBookingRecovered,
  patchAbandonedBookingReminderSent,
  tryClaimAbandonedBookingReminder,
} from "./abandoned-booking-store";

export type AbandonedBookingEnv = {
  TRACKING_STORE: KVNamespace;
  SUMUP_API_KEY?: string;
  RESEND_API_KEY?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  BOOKING_FROM_EMAIL?: string;
  BOOKING_TO_EMAIL?: string;
  SITE_ORIGIN?: string;
  ABANDONED_BOOKING_REMINDER_DELAY_MINUTES?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_ACCESS_KEY?: string;
  EMAIL?: {
    send(message: {
      to: string;
      from: string | { email: string; name?: string };
      subject: string;
      text?: string;
      html?: string;
      replyTo?: string | { email: string; name?: string };
    }): Promise<{ messageId?: string }>;
  };
};

function json(data: unknown, status = 200, origin = "*"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type, x-owner-key, x-driver-key",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function requestOrigin(request: Request): string {
  return request.headers.get("origin") || "*";
}

function siteOrigin(env: AbandonedBookingEnv): string {
  const raw = String(env.SITE_ORIGIN || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://www.myairporttaxini.co.uk";
}

export function isAbandonedBookingsCapturePath(pathname: string): boolean {
  return (
    pathname === "/abandoned-bookings/capture" ||
    pathname === "/api/abandoned-bookings/capture"
  );
}

export function isAbandonedBookingsLookupPath(pathname: string): boolean {
  return (
    pathname === "/abandoned-bookings/by-token" ||
    pathname === "/api/abandoned-bookings/by-token"
  );
}

export function isAbandonedBookingsOwnerPath(pathname: string): boolean {
  return pathname === "/abandoned-bookings" || pathname === "/api/abandoned-bookings";
}

export function isAbandonedBookingsOptOutPath(pathname: string): boolean {
  return (
    pathname === "/abandoned-bookings/opt-out" ||
    pathname === "/api/abandoned-bookings/opt-out"
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function parseJourney(raw: unknown): AbandonedBookingJourneySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const pickupLabel = String(j.pickupLabel ?? "").trim();
  const dropoffLabel = String(j.dropoffLabel ?? "").trim();
  if (!pickupLabel || !dropoffLabel) return null;
  const passengers = Number(j.passengers);
  const suitcases = Number(j.suitcases);
  return {
    pickupLabel,
    dropoffLabel,
    pickupPlaceId: typeof j.pickupPlaceId === "string" ? j.pickupPlaceId : undefined,
    dropoffPlaceId: typeof j.dropoffPlaceId === "string" ? j.dropoffPlaceId : undefined,
    pickupLat: typeof j.pickupLat === "number" ? j.pickupLat : undefined,
    pickupLng: typeof j.pickupLng === "number" ? j.pickupLng : undefined,
    dropoffLat: typeof j.dropoffLat === "number" ? j.dropoffLat : undefined,
    dropoffLng: typeof j.dropoffLng === "number" ? j.dropoffLng : undefined,
    airportCode: typeof j.airportCode === "string" ? j.airportCode : undefined,
    tripMode: typeof j.tripMode === "string" ? j.tripMode : undefined,
    tripDirection: typeof j.tripDirection === "string" ? j.tripDirection : undefined,
    isAirportTrip: Boolean(j.isAirportTrip),
    isFromAirport: Boolean(j.isFromAirport),
    journeyIntent: typeof j.journeyIntent === "string" ? j.journeyIntent : undefined,
    tripDate: String(j.tripDate ?? "").trim(),
    tripTime: String(j.tripTime ?? "").trim(),
    returnJourney: Boolean(j.returnJourney),
    returnDate: typeof j.returnDate === "string" ? j.returnDate : undefined,
    returnTime: typeof j.returnTime === "string" ? j.returnTime : undefined,
    passengers: Number.isFinite(passengers) && passengers > 0 ? passengers : 1,
    suitcases: Number.isFinite(suitcases) && suitcases >= 0 ? suitcases : 0,
    exactPassengers:
      typeof j.exactPassengers === "number" ? j.exactPassengers : null,
    vehicle: typeof j.vehicle === "string" ? j.vehicle : undefined,
    flightNumber: typeof j.flightNumber === "string" ? j.flightNumber : undefined,
    returnFlightNumber:
      typeof j.returnFlightNumber === "string" ? j.returnFlightNumber : undefined,
    tripLabel: typeof j.tripLabel === "string" ? j.tripLabel : undefined,
    journeyDistance: typeof j.journeyDistance === "string" ? j.journeyDistance : undefined,
    journeyDuration: typeof j.journeyDuration === "string" ? j.journeyDuration : undefined,
    quotedAmount:
      typeof j.quotedAmount === "number" && Number.isFinite(j.quotedAmount)
        ? j.quotedAmount
        : undefined,
    quotedAmountLabel:
      typeof j.quotedAmountLabel === "string" ? j.quotedAmountLabel : undefined,
    quoteStep:
      j.quoteStep === 1 || j.quoteStep === 2 || j.quoteStep === 3 ? j.quoteStep : 3,
  };
}

async function paymentBlocksReminder(
  env: AbandonedBookingEnv,
  record: AbandonedBookingRecord,
): Promise<{ alreadyPaid: boolean; cancelledOrRefunded: boolean; paymentReference?: string }> {
  const store = env.TRACKING_STORE;
  if (record.checkoutId && paidBookingStoreConfigured(store)) {
    const paid = await getPaidBookingRecordByCheckoutId(store, record.checkoutId);
    if (paid) {
      const cancelledOrRefunded =
        paid.operationalStatus === "cancelled" ||
        paid.paymentStatus === "fully_refunded" ||
        paid.paymentStatus === "partially_refunded" ||
        Boolean(paid.refundedAt) ||
        Boolean(paid.cancelledAt) ||
        paid.status === "refunded" ||
        paid.status === "cancelled";
      return {
        alreadyPaid: true,
        cancelledOrRefunded,
        paymentReference: paid.paymentReference,
      };
    }
  }

  if (record.checkoutId && env.SUMUP_API_KEY) {
    try {
      const checkout = await getSumUpCheckout(env.SUMUP_API_KEY, record.checkoutId);
      if (isSumUpCheckoutPaid(checkout)) {
        return { alreadyPaid: true, cancelledOrRefunded: false };
      }
    } catch (error) {
      console.error("[abandoned-booking] SumUp recheck failed", {
        checkoutId: record.checkoutId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (record.checkoutId) {
    const pending = await getPendingCheckout(store, record.checkoutId);
    if (pending?.finalizedAt && pending.paymentReference) {
      return {
        alreadyPaid: true,
        cancelledOrRefunded: false,
        paymentReference: pending.paymentReference,
      };
    }
  }

  return { alreadyPaid: false, cancelledOrRefunded: false };
}

export async function handleAbandonedBookingCaptureRequest(
  request: Request,
  env: AbandonedBookingEnv,
): Promise<Response> {
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!env.TRACKING_STORE) return json({ error: "Store unavailable" }, 503, origin);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const customerEmail = normalizeEmail(String(body.customerEmail ?? ""));
  if (!isValidEmail(customerEmail)) {
    return json({ error: "A valid email address is required." }, 400, origin);
  }

  const journey = parseJourney(body.journey);
  if (!journey) {
    return json({ error: "Journey details are required." }, 400, origin);
  }

  // Do not capture bare quote views — require a route + contact email (already validated).
  if (!journey.pickupLabel || !journey.dropoffLabel) {
    return json({ error: "Pickup and drop-off are required." }, 400, origin);
  }

  try {
    const record = await createOrUpdateAbandonedBooking(env.TRACKING_STORE, {
      customerName: String(body.customerName ?? "").trim(),
      customerEmail,
      mobileNumber: String(body.mobileNumber ?? "").trim() || undefined,
      journey,
      checkoutId: typeof body.checkoutId === "string" ? body.checkoutId : undefined,
      checkoutReference:
        typeof body.checkoutReference === "string" ? body.checkoutReference : undefined,
      quoteReference: typeof body.quoteReference === "string" ? body.quoteReference : undefined,
      delayMs: resolveAbandonedBookingDelayMs(env.ABANDONED_BOOKING_REMINDER_DELAY_MINUTES),
    });

    return json(
      {
        ok: true,
        token: record.token,
        status: record.status,
        reminderDueAt: record.reminderDueAt,
        resumeUrl: buildAbandonedBookingRecoveryUrl(record.token, siteOrigin(env)),
      },
      200,
      origin,
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not save abandoned booking" },
      400,
      origin,
    );
  }
}

export async function handleAbandonedBookingLookupRequest(
  request: Request,
  env: AbandonedBookingEnv,
): Promise<Response> {
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
  if (!env.TRACKING_STORE) return json({ error: "Store unavailable" }, 503, origin);

  const url = new URL(request.url);
  const token = normalizeAbandonedBookingToken(url.searchParams.get("t") || "");
  if (!token) return json({ error: "Missing recovery token" }, 400, origin);

  const record = await getAbandonedBookingByToken(env.TRACKING_STORE, token);
  if (!record) {
    return json({ error: "not_found", message: "This recovery link is invalid or has expired." }, 404, origin);
  }

  const now = new Date();
  const maybeExpired = await markAbandonedBookingExpiredIfNeeded(
    env.TRACKING_STORE,
    record,
    now,
  );
  if (maybeExpired.status === "expired") {
    return json(
      { error: "expired", message: "This recovery link has expired." },
      410,
      origin,
    );
  }

  const payment = await paymentBlocksReminder(env, maybeExpired);
  if (payment.alreadyPaid && maybeExpired.status !== "recovered") {
    await markAbandonedBookingRecovered(env.TRACKING_STORE, {
      token: maybeExpired.token,
      checkoutId: maybeExpired.checkoutId,
      paymentReference: payment.paymentReference,
    });
  }

  const resume: AbandonedBookingPublicResume = {
    token: maybeExpired.token,
    status: payment.alreadyPaid ? "recovered" : maybeExpired.status,
    customerName: maybeExpired.customerName,
    customerEmail: maybeExpired.customerEmail,
    mobileNumber: maybeExpired.mobileNumber,
    journey: maybeExpired.journey,
    expiresAt: maybeExpired.expiresAt,
    alreadyPaid: payment.alreadyPaid,
    paymentReference: payment.paymentReference || maybeExpired.paymentReference,
  };

  return json({ ok: true, booking: resume }, 200, origin);
}

export async function handleAbandonedBookingOptOutRequest(
  request: Request,
  env: AbandonedBookingEnv,
): Promise<Response> {
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!env.TRACKING_STORE) return json({ error: "Store unavailable" }, 503, origin);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const token = normalizeAbandonedBookingToken(
    String(body.token ?? url.searchParams.get("t") ?? ""),
  );
  if (!token) return json({ error: "Missing recovery token" }, 400, origin);

  const updated = await markAbandonedBookingOptedOut(env.TRACKING_STORE, token);
  if (!updated) {
    return json({ error: "not_found" }, 404, origin);
  }
  return json({ ok: true, status: updated.status }, 200, origin);
}

export async function handleAbandonedBookingsOwnerRequest(
  request: Request,
  env: AbandonedBookingEnv,
): Promise<Response> {
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
  if (!ownerAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401, origin);
  }
  if (!env.TRACKING_STORE) return json({ error: "Store unavailable" }, 503, origin);

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40) || 40));
  const records = await listAbandonedBookingsForOwner(env.TRACKING_STORE, limit);
  return json(
    {
      ok: true,
      bookings: records.map(toAbandonedBookingOwnerView),
    },
    200,
    origin,
  );
}

/**
 * Capture helper for the payments path (validated email + SumUp checkout created).
 */
export async function captureAbandonedBookingFromCheckout(
  env: AbandonedBookingEnv,
  input: {
    customerName: string;
    customerEmail: string;
    mobileNumber?: string;
    journey: AbandonedBookingJourneySnapshot;
    checkoutId: string;
    checkoutReference?: string;
  },
): Promise<AbandonedBookingRecord | null> {
  if (!env.TRACKING_STORE) return null;
  if (!isValidEmail(input.customerEmail)) return null;
  try {
    return await createOrUpdateAbandonedBooking(env.TRACKING_STORE, {
      ...input,
      delayMs: resolveAbandonedBookingDelayMs(env.ABANDONED_BOOKING_REMINDER_DELAY_MINUTES),
    });
  } catch (error) {
    console.error("[abandoned-booking] capture from checkout failed", error);
    return null;
  }
}

export async function markAbandonedBookingRecoveredFromPayment(
  store: KVNamespace | undefined,
  input: { token?: string; checkoutId?: string; paymentReference?: string },
): Promise<void> {
  if (!store) return;
  try {
    await markAbandonedBookingRecovered(store, input);
  } catch (error) {
    console.error("[abandoned-booking] mark recovered failed", error);
  }
}

/**
 * Hourly cron: send one recovery email after 1 hour if still unpaid.
 * Fresh payment / opt-out / cancelled checks immediately before send.
 * Claim-before-send prevents duplicate emails under concurrent cron runs.
 */
export async function processDueAbandonedBookingRecoveryEmails(
  env: AbandonedBookingEnv,
  now = new Date(),
): Promise<{
  processed: number;
  sent: number;
  recovered: number;
  expired: number;
  skipped: number;
  errors: number;
}> {
  if (!env.TRACKING_STORE) {
    return { processed: 0, sent: 0, recovered: 0, expired: 0, skipped: 0, errors: 0 };
  }

  const store = env.TRACKING_STORE;
  const tokens = await listOpenAbandonedBookingTokens(store);
  const origin = siteOrigin(env);
  let sent = 0;
  let recovered = 0;
  let expired = 0;
  let skipped = 0;
  let errors = 0;

  for (const token of tokens) {
    try {
      let record = await getAbandonedBookingByToken(store, token);
      if (!record) {
        skipped += 1;
        continue;
      }

      if (record.status === "recovered" || record.status === "opted_out") {
        skipped += 1;
        continue;
      }

      record = await markAbandonedBookingExpiredIfNeeded(store, record, now);
      if (record.status === "expired") {
        expired += 1;
        continue;
      }

      const payment = await paymentBlocksReminder(env, record);
      if (payment.alreadyPaid) {
        await markAbandonedBookingRecovered(store, {
          token: record.token,
          checkoutId: record.checkoutId,
          paymentReference: payment.paymentReference,
        });
        recovered += 1;
        continue;
      }
      if (payment.cancelledOrRefunded) {
        skipped += 1;
        continue;
      }

      const optedOut = await isAbandonedBookingEmailOptedOut(store, record.customerEmail);
      if (
        !shouldSendAbandonedBookingReminder(record, {
          now,
          optedOut,
          alreadyPaid: payment.alreadyPaid,
          cancelledOrRefunded: payment.cancelledOrRefunded,
        })
      ) {
        skipped += 1;
        continue;
      }

      const claim = await tryClaimAbandonedBookingReminder(store, token);
      if (!claim.ok) {
        skipped += 1;
        continue;
      }

      // Fresh re-checks after claim (payment / opt-out / status may have changed).
      const paymentAgain = await paymentBlocksReminder(env, claim.record);
      const optedOutAgain = await isAbandonedBookingEmailOptedOut(
        store,
        claim.record.customerEmail,
      );
      if (
        !shouldSendAbandonedBookingReminder(claim.record, {
          now,
          optedOut: optedOutAgain,
          alreadyPaid: paymentAgain.alreadyPaid,
          cancelledOrRefunded: paymentAgain.cancelledOrRefunded,
        })
      ) {
        if (paymentAgain.alreadyPaid) {
          await markAbandonedBookingRecovered(store, {
            token: claim.record.token,
            checkoutId: claim.record.checkoutId,
            paymentReference: paymentAgain.paymentReference,
          });
          recovered += 1;
        } else {
          await clearAbandonedBookingReminderClaim(store, token, claim.claimId);
          skipped += 1;
        }
        continue;
      }

      const email = buildAbandonedBookingRecoveryEmail(claim.record, { origin });
      const result = await trySendBrandedCustomerEmail(env, {
        to: claim.record.customerEmail,
        toName: claim.record.customerName,
        subject: email.subject,
        body: email.text,
        htmlBody: email.html,
      });

      if (result.sent) {
        await patchAbandonedBookingReminderSent(store, token);
        sent += 1;
      } else {
        await clearAbandonedBookingReminderClaim(store, token, claim.claimId);
        errors += 1;
        console.error("[abandoned-booking] reminder send failed", {
          token: token.slice(0, 8),
          error: result.error,
        });
      }
    } catch (error) {
      errors += 1;
      console.error("[abandoned-booking] processor error", {
        token: token.slice(0, 8),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processed: tokens.length,
    sent,
    recovered,
    expired,
    skipped,
    errors,
  };
}

export { abandonedBookingStatusLabel };
