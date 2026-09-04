/**
 * Return Journey Offer: hourly processor + public token lookup.
 */

import { corsHeaders, resolvePlaceFromAddressLabel } from "../shared/google-places";
import { BUSINESS_WEBSITE } from "../shared/business-email";
import {
  RETURN_OFFER_CONFIG,
  airportDisplayName,
  buildReturnOfferAdminSummary,
  buildReturnOfferConfirmedPlaces,
  buildReturnOfferCustomerUrl,
  buildReturnOfferPublicSnapshot,
  evaluateReturnOfferAccess,
  generateReturnOfferId,
  generateReturnOfferToken,
  hasCorrespondingReturnBooking,
  hashReturnOfferToken,
  isConfirmedReturnOfferPlace,
  normalizeReturnOfferPlace,
  normalizeReturnOfferToken,
  returnOfferPlaceFromServedAirport,
  paidBookingToReturnOfferSnapshot,
  planManualReturnOfferSend,
  planReturnOfferProcessing,
  resolveReturnOfferConfig,
  shouldApplyReturnOfferDiscount,
  type ReturnOfferPlaceSnapshot,
  type ReturnOfferPublicSnapshot,
  type ReturnOfferRecord,
} from "../shared/return-offer";
import { buildReturnOfferEmail } from "../shared/return-offer-emails";
import { journeyStatusOf } from "../shared/tracking";
import { getPaidBookingRecord, listRecentPaidBookings } from "./paid-booking-store";
import { findTrackingJobsByPaymentReference } from "./tracking-store";
import {
  clearReturnOfferSendClaim,
  getReturnOfferByPaymentReference,
  getReturnOfferByTokenHash,
  listOpenReturnOfferRefs,
  markReturnOfferSent,
  saveReturnOfferRecord,
  tryClaimReturnOfferSend,
} from "./return-offer-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

export type ReturnOfferEnv = WorkerEmailEnv &
  DriverAuthEnv & {
    TRACKING_STORE: KVNamespace;
    SITE_ORIGIN?: string;
    GOOGLE_PLACES_API_KEY?: string;
    RETURN_OFFER_LOCAL_TO_AIRPORT_DELAY_HOURS?: string;
    RETURN_OFFER_LAST_MINUTE_LOCAL_DELAY_HOURS?: string;
    RETURN_OFFER_AIRPORT_TO_LOCAL_DELAY_HOURS?: string;
  };

const DEFAULT_SITE_ORIGIN = BUSINESS_WEBSITE;

function siteOrigin(env: ReturnOfferEnv): string {
  return (env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export function isReturnOfferLookupPath(pathname: string): boolean {
  return (
    pathname === "/return-offers/by-token" || pathname === "/api/return-offers/by-token"
  );
}

export function isManualReturnOfferSendPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/return-offer/send" ||
    pathname === "/api/paid-bookings/return-offer/send"
  );
}

export async function resolveJourneyCompletedAt(
  store: KVNamespace,
  paymentReference: string,
): Promise<string | null> {
  const jobs = await findTrackingJobsByPaymentReference(store, paymentReference);
  const outbound =
    jobs.find((job) => job.journeyLeg === "outbound") ??
    jobs.find((job) => job.journeyLeg !== "return") ??
    jobs[0];
  if (!outbound) return null;
  if (outbound.journeyCompletedAt?.trim()) return outbound.journeyCompletedAt.trim();
  if (journeyStatusOf(outbound) === "completed") {
    return outbound.driverUpdatedAt || outbound.trackingStoppedAt || new Date().toISOString();
  }
  return null;
}

async function upsertFromPlan(
  store: KVNamespace,
  existing: ReturnOfferRecord | null,
  booking: ReturnType<typeof paidBookingToReturnOfferSnapshot>,
  plan: ReturnType<typeof planReturnOfferProcessing>,
): Promise<ReturnOfferRecord> {
  const nowIso = new Date().toISOString();
  const airportCode = plan.airportCode || existing?.airportCode;
  const direction = plan.direction || existing?.direction || "local_to_airport";
  const record: ReturnOfferRecord = {
    id: existing?.id || generateReturnOfferId(),
    originalPaymentReference: booking.paymentReference,
    customerEmail: String(booking.customerEmail ?? "").trim().toLowerCase(),
    customerName: String(booking.customerName ?? "").trim(),
    direction,
    airportCode: airportCode || "BFS",
    airportName: airportCode ? airportDisplayName(airportCode) : existing?.airportName || "",
    originalPickupLabel: booking.pickupLabel,
    originalDropoffLabel: booking.dropoffLabel,
    reversedPickupLabel: booking.dropoffLabel,
    reversedDropoffLabel: booking.pickupLabel,
    tokenHash: existing?.tokenHash || "",
    status: plan.status,
    ineligibleReason: plan.eligible ? undefined : plan.reason,
    scheduledAt: plan.scheduledAt,
    emailSentAt: existing?.emailSentAt,
    sendClaimId: existing?.sendClaimId,
    sendClaimedAt: existing?.sendClaimedAt,
    redeemedAt: existing?.redeemedAt,
    returnBookingPaymentReference: existing?.returnBookingPaymentReference,
    expiresAt: existing?.expiresAt,
    reversedPickupPlace: existing?.reversedPickupPlace,
    reversedDropoffPlace: existing?.reversedDropoffPlace,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
  await saveReturnOfferRecord(store, record);
  return record;
}

async function deliverClaimedReturnOfferEmail(input: {
  env: ReturnOfferEnv;
  booking: ReturnType<typeof paidBookingToReturnOfferSnapshot>;
  record: ReturnOfferRecord;
  journeyCompletedAt: string | null;
  candidates: ReturnType<typeof paidBookingToReturnOfferSnapshot>[];
  now: Date;
  config: ReturnType<typeof resolveReturnOfferConfig>;
  planner: "scheduled" | "manual";
}): Promise<"sent" | "skipped" | "error"> {
  const store = input.env.TRACKING_STORE;
  const claim = await tryClaimReturnOfferSend(store, input.booking.paymentReference);
  if (!claim.ok) {
    return "skipped";
  }

  const recheck =
    input.planner === "manual"
      ? planManualReturnOfferSend({
          booking: input.booking,
          existing: { ...claim.record, status: "ELIGIBLE", emailSentAt: undefined },
          correspondingReturnBooked: hasCorrespondingReturnBooking(
            input.booking,
            input.candidates,
          ),
          journeyCompletedAt: input.journeyCompletedAt,
          now: input.now,
          config: input.config,
        })
      : planReturnOfferProcessing({
          booking: input.booking,
          existing: { ...claim.record, status: "SCHEDULED", emailSentAt: undefined },
          correspondingReturnBooked: hasCorrespondingReturnBooking(
            input.booking,
            input.candidates,
          ),
          journeyCompletedAt: input.journeyCompletedAt,
          now: input.now,
          config: input.config,
        });
  if (!recheck.shouldSend || !recheck.eligible) {
    await clearReturnOfferSendClaim(store, input.booking.paymentReference, claim.claimId);
    await upsertFromPlan(store, claim.record, input.booking, recheck);
    return "skipped";
  }

  const rawToken = generateReturnOfferToken();
  const tokenHash = await hashReturnOfferToken(rawToken);
  const ctaUrl = buildReturnOfferCustomerUrl(siteOrigin(input.env), rawToken);
  const email = buildReturnOfferEmail({
    direction: input.record.direction,
    customerName: input.record.customerName,
    airportName: input.record.airportName,
    ctaUrl,
  });
  const send = await trySendBrandedCustomerEmail(input.env, {
    to: input.record.customerEmail,
    toName: input.record.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });
  if (!send.sent) {
    await clearReturnOfferSendClaim(store, input.booking.paymentReference, claim.claimId);
    return "error";
  }

  const expires = new Date(
    input.now.getTime() + input.config.offerExpiryDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  await markReturnOfferSent(store, input.booking.paymentReference, {
    tokenHash,
    claimId: claim.claimId,
    expiresAt: expires,
  });
  return "sent";
}

export async function processDueReturnOffers(
  env: ReturnOfferEnv,
): Promise<{ scanned: number; scheduled: number; sent: number; skipped: number; errors: number }> {
  const result = { scanned: 0, scheduled: 0, sent: 0, skipped: 0, errors: 0 };
  const store = env.TRACKING_STORE;
  const config = resolveReturnOfferConfig(env);
  const now = new Date();

  const recent = await listRecentPaidBookings(store, { days: 90, limit: 200 });
  const snapshots = recent.map(paidBookingToReturnOfferSnapshot);
  const byRef = new Map(snapshots.map((row) => [row.paymentReference, row]));

  const openRefs = await listOpenReturnOfferRefs(store);
  for (const ref of openRefs) {
    if (byRef.has(ref)) continue;
    const paid = await getPaidBookingRecord(store, ref);
    if (paid) byRef.set(ref, paidBookingToReturnOfferSnapshot(paid));
  }

  const candidates = [...byRef.values()];

  for (const booking of candidates) {
    result.scanned += 1;
    try {
      const existing = await getReturnOfferByPaymentReference(store, booking.paymentReference);
      if (existing?.status === "REDEEMED") {
        continue;
      }

      const correspondingReturnBooked = hasCorrespondingReturnBooking(booking, candidates);
      const journeyCompletedAt = await resolveJourneyCompletedAt(store, booking.paymentReference);
      const plan = planReturnOfferProcessing({
        booking,
        existing,
        correspondingReturnBooked,
        journeyCompletedAt,
        now,
        config,
      });

      if (existing?.status === "SENT" && !plan.shouldSend) {
        continue;
      }

      const record = await upsertFromPlan(store, existing, booking, plan);
      if (record.status === "SCHEDULED" && plan.scheduledAt) result.scheduled += 1;

      if (!plan.shouldSend) {
        result.skipped += 1;
        continue;
      }

      const delivered = await deliverClaimedReturnOfferEmail({
        env,
        booking,
        record,
        journeyCompletedAt,
        candidates,
        now,
        config,
        planner: "scheduled",
      });
      if (delivered === "sent") result.sent += 1;
      else if (delivered === "error") result.errors += 1;
      else result.skipped += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
}

export async function resolveReturnOfferForPayment(
  store: KVNamespace,
  token: string,
  journey: { pickupLabel: string; dropoffLabel: string; returnJourney?: boolean },
): Promise<
  | { ok: true; record: ReturnOfferRecord; discountRate: number }
  | { ok: false; reason: string }
> {
  const normalized = normalizeReturnOfferToken(token);
  if (!normalized || normalized.length < 32) {
    return { ok: false, reason: "invalid_token" };
  }
  const tokenHash = await hashReturnOfferToken(normalized);
  const record = await getReturnOfferByTokenHash(store, tokenHash);
  const access = evaluateReturnOfferAccess(record);
  if (!access.ok || !record) {
    return { ok: false, reason: access.reason };
  }
  if (
    !shouldApplyReturnOfferDiscount({
      tokenValid: true,
      pickupLabel: journey.pickupLabel,
      dropoffLabel: journey.dropoffLabel,
      returnJourney: journey.returnJourney,
    })
  ) {
    return { ok: false, reason: "not_airport_transfer" };
  }
  return { ok: true, record, discountRate: RETURN_OFFER_CONFIG.discountRate };
}

function placeFromResolvedLabel(
  resolved: {
    placeId: string;
    formattedAddress: string;
    displayAddress: string;
    placeName: string | null;
    lat: number | null;
    lng: number | null;
    postalCode: string | null;
    countryCode: string | null;
    streetNumber: string | null;
    route: string | null;
    locality: string | null;
    administrativeArea: string | null;
  },
  originalLabel: string,
): ReturnOfferPlaceSnapshot | undefined {
  const label = originalLabel.trim();
  return normalizeReturnOfferPlace({
    placeId: resolved.placeId,
    formattedAddress: resolved.formattedAddress || label,
    displayAddress: label || resolved.displayAddress,
    placeName: resolved.placeName,
    lat: resolved.lat ?? undefined,
    lng: resolved.lng ?? undefined,
    postalCode: resolved.postalCode,
    countryCode: resolved.countryCode,
    streetNumber: resolved.streetNumber,
    route: resolved.route,
    locality: resolved.locality,
    administrativeArea: resolved.administrativeArea,
  });
}

async function enrichReturnOfferSnapshotPlaces(
  env: ReturnOfferEnv,
  record: ReturnOfferRecord,
): Promise<ReturnOfferPublicSnapshot> {
  const snapshot = buildReturnOfferPublicSnapshot(record);
  if (
    isConfirmedReturnOfferPlace(snapshot.pickupPlace) &&
    isConfirmedReturnOfferPlace(snapshot.dropoffPlace)
  ) {
    return snapshot;
  }

  const localLabel = snapshot.localAddressLabel.trim();
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim() || "";
  if (!apiKey || !localLabel) {
    return snapshot;
  }

  const resolved = await resolvePlaceFromAddressLabel(apiKey, localLabel);
  if (!resolved) {
    return snapshot;
  }
  const localPlace = placeFromResolvedLabel(resolved, snapshot.localAddressLabel);
  if (!localPlace) {
    return snapshot;
  }

  const places = buildReturnOfferConfirmedPlaces({
    direction: record.direction,
    airportCode: record.airportCode,
    localPlace,
    localAddressLabel: snapshot.localAddressLabel,
  });
  const enriched: ReturnOfferRecord = {
    ...record,
    reversedPickupPlace: places.pickupPlace,
    reversedDropoffPlace: places.dropoffPlace,
    updatedAt: new Date().toISOString(),
  };
  await saveReturnOfferRecord(env.TRACKING_STORE, enriched);
  return buildReturnOfferPublicSnapshot(enriched);
}

export async function handleGetReturnOffer(
  request: Request,
  env: ReturnOfferEnv,
  origin: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const token = normalizeReturnOfferToken(
    url.searchParams.get("t") || url.searchParams.get("returnOffer") || "",
  );
  if (!token) {
    return jsonResponse({ ok: false, error: "This return offer link is invalid." }, 404, origin);
  }
  const tokenHash = await hashReturnOfferToken(token);
  const record = await getReturnOfferByTokenHash(env.TRACKING_STORE, tokenHash);
  const access = evaluateReturnOfferAccess(record);
  if (!access.ok || !record) {
    return jsonResponse(
      {
        ok: false,
        error:
          access.reason === "redeemed"
            ? "This return offer has already been used."
            : "This return offer link is invalid or no longer available.",
        reason: access.reason,
      },
      access.reason === "redeemed" ? 409 : 404,
      origin,
    );
  }

  const quote: ReturnOfferPublicSnapshot = await enrichReturnOfferSnapshotPlaces(env, record);
  return jsonResponse(
    {
      ok: true,
      tokenValid: true,
      quote,
    },
    200,
    origin,
  );
}

export async function handleManualReturnOfferSend(
  request: Request,
  env: ReturnOfferEnv,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to send a return offer." },
      401,
      origin,
    );
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const body = (await request.json().catch(() => null)) as
    | { paymentReference?: string }
    | null;
  const paymentReference = String(body?.paymentReference ?? "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Missing paymentReference" }, 400, origin);
  }

  const store = env.TRACKING_STORE;
  const paid = await getPaidBookingRecord(store, paymentReference);
  if (!paid) {
    return jsonResponse({ error: "Booking not found" }, 404, origin);
  }

  const booking = paidBookingToReturnOfferSnapshot(paid);
  const existing = await getReturnOfferByPaymentReference(store, paymentReference);
  const recent = await listRecentPaidBookings(store, { days: 90, limit: 200 });
  const candidates = recent.map(paidBookingToReturnOfferSnapshot);
  if (!candidates.some((row) => row.paymentReference === booking.paymentReference)) {
    candidates.push(booking);
  }
  const correspondingReturnBooked = hasCorrespondingReturnBooking(booking, candidates);
  const journeyCompletedAt = await resolveJourneyCompletedAt(store, paymentReference);
  const now = new Date();
  const config = resolveReturnOfferConfig(env);
  const plan = planManualReturnOfferSend({
    booking,
    existing,
    correspondingReturnBooked,
    journeyCompletedAt,
    now,
    config,
  });

  const summary = () =>
    buildReturnOfferAdminSummary({
      booking,
      record: existing,
      correspondingReturnBooked,
      now,
    });

  if (!plan.shouldSend) {
    const status =
      plan.reason === "offer_already_sent" || plan.reason === "offer_already_redeemed"
        ? 409
        : 400;
    return jsonResponse(
      {
        ok: false,
        error:
          plan.reason === "offer_already_sent"
            ? "Return offer already sent."
            : plan.reason === "offer_already_redeemed"
              ? "Return offer already redeemed."
              : plan.reason === "corresponding_return_booked"
                ? "A corresponding return booking already exists."
                : "This booking is not eligible for a return offer.",
        reason: plan.reason,
        returnOffer: summary(),
      },
      status,
      origin,
    );
  }

  const record = await upsertFromPlan(store, existing, booking, {
    ...plan,
    status: "ELIGIBLE",
  });
  const delivered = await deliverClaimedReturnOfferEmail({
    env,
    booking,
    record,
    journeyCompletedAt,
    candidates,
    now,
    config,
    planner: "manual",
  });

  const sentRecord = await getReturnOfferByPaymentReference(store, paymentReference);
  const returnOffer = buildReturnOfferAdminSummary({
    booking,
    record: sentRecord,
    correspondingReturnBooked,
    now,
  });

  if (delivered !== "sent") {
    return jsonResponse(
      {
        ok: false,
        error:
          delivered === "error"
            ? "Return offer email could not be sent. Try again."
            : "Return offer was not sent.",
        reason: delivered,
        returnOffer,
      },
      delivered === "error" ? 502 : 409,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      paymentReference,
      customerEmail: record.customerEmail,
      sentAt: sentRecord?.emailSentAt,
      returnOffer,
    },
    200,
    origin,
  );
}
