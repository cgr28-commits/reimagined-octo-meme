/**
 * Owner-only undo for an accidental Complete job.
 * Restores journey stage. Does not change payment, fare, or booking details.
 */

import { corsHeaders } from "../shared/google-places";
import {
  completionTimestampsMatch,
  journeyStatusOf,
  ownerReopenStatusLabel,
  reopenCompletedJourney,
  type TrackingJobRecord,
} from "../shared/tracking";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  completionTipPreservation,
  deleteUnpaidTipRequest,
} from "./journey-tip-handlers";
import { buildReviewRequestSummary } from "./review-request-handlers";
import {
  getPaidBookingRecord,
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";
import {
  findTrackingJobsByPaymentReference,
  getTrackingJob,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";

type Env = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
};

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

export function isReopenJobPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/reopen-job" ||
    pathname === "/api/paid-bookings/reopen-job"
  );
}

async function resolveCompletedJob(
  store: KVNamespace,
  paymentReference: string,
  trackingToken: string,
): Promise<
  | { ok: true; job: TrackingJobRecord }
  | { ok: false; status: number; error: string }
> {
  const jobs = await findTrackingJobsByPaymentReference(store, paymentReference);
  const owned = jobs.filter((job) => job.paymentReference?.trim() === paymentReference);

  if (trackingToken) {
    const match = owned.find((job) => job.token === trackingToken);
    if (!match) {
      const direct = await getTrackingJob(store, trackingToken);
      if (direct && direct.paymentReference?.trim() !== paymentReference) {
        return {
          ok: false,
          status: 409,
          error: "That journey belongs to a different booking.",
        };
      }
      return { ok: false, status: 404, error: "Journey not found for this booking." };
    }
    return { ok: true, job: match };
  }

  const completed = owned.filter((job) => journeyStatusOf(job) === "completed");
  if (completed.length === 1) {
    return { ok: true, job: completed[0]! };
  }
  if (completed.length === 0 && owned.length === 1) {
    return { ok: true, job: owned[0]! };
  }
  if (owned.length === 0) {
    return { ok: false, status: 404, error: "Journey not found for this booking." };
  }
  return {
    ok: false,
    status: 409,
    error: "Choose the journey leg to reopen.",
  };
}

export async function handleReopenJobRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — Reopen job is owner only." },
      401,
      origin,
    );
  }

  if (!trackingStoreConfigured(env.TRACKING_STORE) || !paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  const trackingToken = String(body.trackingToken ?? body.token ?? "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Payment reference is required." }, 400, origin);
  }

  const store = env.TRACKING_STORE;
  const resolved = await resolveCompletedJob(store, paymentReference, trackingToken);
  if (!resolved.ok) {
    return jsonResponse({ error: resolved.error }, resolved.status, origin);
  }

  const fresh = await getTrackingJob(store, resolved.job.token);
  const job = fresh ?? resolved.job;
  if (job.paymentReference?.trim() !== paymentReference) {
    return jsonResponse({ error: "That journey belongs to a different booking." }, 409, origin);
  }

  if (journeyStatusOf(job) !== "completed") {
    return jsonResponse(
      {
        ok: true,
        idempotent: true,
        paymentReference,
        trackingToken: job.token,
        journeyStatus: journeyStatusOf(job),
        restoredStatus: journeyStatusOf(job),
        restoredStatusLabel: ownerReopenStatusLabel(journeyStatusOf(job)),
        reviewRequestOutcome: "none",
        reviewMessage: null,
      },
      200,
      origin,
    );
  }

  const tip = await completionTipPreservation(store, job.tipToken);
  const reopened = reopenCompletedJourney(job, {
    preservePaidTip: tip.preservePaidTip,
  });
  if (!reopened.changed) {
    return jsonResponse(
      {
        ok: true,
        idempotent: true,
        paymentReference,
        trackingToken: job.token,
        journeyStatus: journeyStatusOf(job),
        restoredStatus: reopened.restoredStatus,
        restoredStatusLabel: reopened.restoredStatusLabel,
        reviewRequestOutcome: "none",
        reviewMessage: null,
      },
      200,
      origin,
    );
  }

  if (reopened.unpaidTipTokenToDelete) {
    await deleteUnpaidTipRequest(store, reopened.unpaidTipTokenToDelete);
  }

  await saveTrackingJob(store, reopened.job);

  const paid = await getPaidBookingRecord(store, paymentReference);
  if (paid && reopened.completionTimestamp) {
    const isReturnLeg = job.journeyLeg === "return";
    const legCompletedAt = isReturnLeg ? paid.returnCompletedAt : paid.outboundCompletedAt;
    if (completionTimestampsMatch(legCompletedAt, reopened.completionTimestamp)) {
      const nextPaid = { ...paid };
      if (isReturnLeg) delete nextPaid.returnCompletedAt;
      else delete nextPaid.outboundCompletedAt;
      await savePaidBookingRecord(store, nextPaid);
    }
  }

  return jsonResponse(
    {
      ok: true,
      idempotent: false,
      paymentReference,
      trackingToken: reopened.job.token,
      previousStatus: "completed",
      journeyStatus: reopened.restoredStatus,
      restoredStatus: reopened.restoredStatus,
      restoredStatusLabel: reopened.restoredStatusLabel,
      originalCompletionTimestamp: reopened.completionTimestamp,
      reviewRequestOutcome: reopened.reviewOutcome,
      reviewMessage: reopened.reviewMessage,
      reviewRequest: buildReviewRequestSummary(reopened.job),
      audit: reopened.audit,
    },
    200,
    origin,
  );
}
