/**
 * Return Journey Offer: hourly processor + public token lookup.
 */

import { corsHeaders } from "../shared/google-places";
import { BUSINESS_WEBSITE } from "../shared/business-email";
import {
  RETURN_OFFER_CONFIG,
  airportDisplayName,
  buildReturnOfferCustomerUrl,
  buildReturnOfferPublicSnapshot,
  evaluateReturnOfferAccess,
  generateReturnOfferId,
  generateReturnOfferToken,
  hasCorrespondingReturnBooking,
  hashReturnOfferToken,
  normalizeReturnOfferToken,
  paidBookingToReturnOfferSnapshot,
  planReturnOfferProcessing,
  resolveReturnOfferConfig,
  shouldApplyReturnOfferDiscount,
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

export type ReturnOfferEnv = WorkerEmailEnv & {
  TRACKING_STORE: KVNamespace;
  SITE_ORIGIN?: string;
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
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
  await saveReturnOfferRecord(store, record);
  return record;
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

      const claim = await tryClaimReturnOfferSend(store, booking.paymentReference);
      if (!claim.ok) {
        result.skipped += 1;
        continue;
      }

      const recheck = planReturnOfferProcessing({
        booking,
        existing: { ...claim.record, status: "SCHEDULED", emailSentAt: undefined },
        correspondingReturnBooked: hasCorrespondingReturnBooking(booking, candidates),
        journeyCompletedAt,
        now,
        config,
      });
      if (!recheck.shouldSend || !recheck.eligible) {
        await clearReturnOfferSendClaim(store, booking.paymentReference, claim.claimId);
        await upsertFromPlan(store, claim.record, booking, recheck);
        result.skipped += 1;
        continue;
      }

      const rawToken = generateReturnOfferToken();
      const tokenHash = await hashReturnOfferToken(rawToken);
      const ctaUrl = buildReturnOfferCustomerUrl(siteOrigin(env), rawToken);
      const email = buildReturnOfferEmail({
        direction: record.direction,
        customerName: record.customerName,
        airportName: record.airportName,
        ctaUrl,
      });
      const send = await trySendBrandedCustomerEmail(env, {
        to: record.customerEmail,
        toName: record.customerName,
        subject: email.subject,
        body: email.text,
        htmlBody: email.html,
      });
      if (!send.sent) {
        await clearReturnOfferSendClaim(store, booking.paymentReference, claim.claimId);
        result.errors += 1;
        continue;
      }

      const expires = new Date(
        now.getTime() + config.offerExpiryDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      await markReturnOfferSent(store, booking.paymentReference, {
        tokenHash,
        claimId: claim.claimId,
        expiresAt: expires,
      });
      result.sent += 1;
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

  const quote: ReturnOfferPublicSnapshot = buildReturnOfferPublicSnapshot(record);
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
