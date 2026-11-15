/**
 * "Send a price" link in the owner's New request email.
 *
 * The owner taps the link in the email, sees the request, types a fare and taps
 * Send price. That runs exactly the same code as Owner Dashboard → Website requests
 * → Send price (same quote record, payment link and customer email).
 *
 * Link security (same scheme as the one-tap approval links in owner-approval-alert):
 * - The token names ONE booking job (`job:<id>`) and expires after the trip date.
 *   It is HMAC-SHA256 signed with the Worker secret, so it can't be forged or
 *   pointed at another booking, and the owner key never appears in a URL.
 * - Opening the link never acts by itself: the page shows the request and the owner
 *   presses Send price. The token is only ever sent in a POST body.
 * - The usual checks still apply: a paid or cancelled booking can't be re-priced.
 */
import type { BookingJobRecord } from "../shared/booking-job";
import { getBookingJob } from "./booking-job-store";
import { signOwnerApprovalToken, verifyOwnerApprovalToken, type OwnerApprovalLinkEnv } from "./owner-approval-alert";

const SITE = "https://www.myairporttaxini.co.uk";
const JOB_PREFIX = "job:";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Link stays usable until the end of the day after the outbound trip (min 2 days, max ~13 months). */
export function ownerRequestLinkExpiry(job: Pick<BookingJobRecord, "tripDate">, now = new Date()): string {
  const trip = Date.parse(`${job.tripDate?.trim() || ""}T23:59:59Z`);
  const min = now.getTime() + 2 * DAY_MS;
  const max = now.getTime() + 400 * DAY_MS;
  const wanted = Number.isFinite(trip) ? trip + DAY_MS : min;
  return new Date(Math.min(max, Math.max(min, wanted))).toISOString();
}

export async function ownerRequestPriceUrl(
  env: OwnerApprovalLinkEnv,
  job: Pick<BookingJobRecord, "id" | "tripDate">,
  now = new Date(),
): Promise<string | null> {
  const token = await signOwnerApprovalToken(env, `${JOB_PREFIX}${job.id}`, ownerRequestLinkExpiry(job, now)).catch(
    () => null,
  );
  return token ? `${SITE}/owner/price/?t=${encodeURIComponent(token)}` : null;
}

export async function verifyOwnerRequestToken(
  env: OwnerApprovalLinkEnv,
  token: string,
  now = new Date(),
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const verified = await verifyOwnerApprovalToken(env, token, now);
  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error.includes("expired") ? "This link has expired — use the Owner Dashboard instead." : verified.error,
    };
  }
  if (!verified.reference.startsWith(JOB_PREFIX)) return { ok: false, error: "This link is not valid." };
  return { ok: true, jobId: verified.reference.slice(JOB_PREFIX.length) };
}

/** What the price page shows. Only fields the owner already sees in the request email. */
export function ownerRequestPreview(job: BookingJobRecord) {
  return {
    ok: true as const,
    id: job.id,
    status: job.status,
    customerName: job.customerName,
    customerEmail: job.customerEmail,
    customerMobile: job.customerMobile,
    tripLabel: job.tripLabel,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    returnJourney: Boolean(job.returnJourney),
    returnDate: job.returnDate ?? "",
    returnTime: job.returnTime ?? "",
    flightNumber: job.flightNumber ?? "",
    passengers: job.passengers,
    suitcases: job.suitcases,
    vehicle: job.vehicle,
    quotedPrice: job.quotedPrice ?? "",
    sentQuotePriceLabel: job.sentQuotePriceLabel ?? "",
    sentQuoteAt: job.sentQuoteAt ?? "",
    sentQuoteExpiresAt: job.sentQuoteExpiresAt ?? "",
  };
}

export async function loadJobForOwnerRequestToken(
  env: OwnerApprovalLinkEnv & { TRACKING_STORE?: KVNamespace },
  token: string,
): Promise<{ ok: true; job: BookingJobRecord } | { ok: false; error: string; status: number }> {
  if (!env.TRACKING_STORE) return { ok: false, error: "Storage is not configured", status: 503 };
  const verified = await verifyOwnerRequestToken(env, token);
  if (!verified.ok) return { ok: false, error: verified.error, status: 403 };
  const job = await getBookingJob(env.TRACKING_STORE, verified.jobId);
  if (!job) return { ok: false, error: "Request not found.", status: 404 };
  return { ok: true, job };
}
