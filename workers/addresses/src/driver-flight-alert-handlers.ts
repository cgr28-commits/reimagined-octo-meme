/**
 * Driver flight-delay / landing / cancellation alerts.
 * Emails the assigned driver (or owner bookings@ fallback). Deduped in KV.
 */

import {
  decideDriverFlightAlert,
  driverFlightAlertKvKey,
  type DriverFlightAlertSnapshot,
} from "../shared/driver-flight-alerts";
import type { VerifiedFlight } from "../shared/flight-lookup";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { getBookingJob } from "./booking-job-store";
import {
  getPaidBookingRecord,
  paidBookingStoreConfigured,
} from "./paid-booking-store";
import {
  findTrackingJobsByPaymentReference,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendEmail, type WorkerEmailEnv } from "./worker-email";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
  };

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

async function resolveDriverNotifyEmail(
  env: Env,
  paymentReference: string,
): Promise<{ email: string; driverName: string } | null> {
  if (!env.TRACKING_STORE || !paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return null;
  }
  const jobs = await findTrackingJobsByPaymentReference(env.TRACKING_STORE, paymentReference);
  const paid = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  const bookingJob =
    (await getBookingJob(env.TRACKING_STORE, paymentReference)) ??
    (paid?.trackingToken
      ? await getBookingJob(env.TRACKING_STORE, paid.trackingToken)
      : null);

  const email = bookingJob?.driverEmail?.trim();
  if (email && email.includes("@")) {
    return {
      email,
      driverName:
        bookingJob?.driverFirstName?.trim() ||
        jobs[0]?.assignedDriverName?.trim() ||
        "Driver",
    };
  }

  return null;
}

export async function handleDriverFlightAlertRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  if (!env.TRACKING_STORE || !trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Store not configured" }, 503, origin);
  }

  let body: {
    paymentReference?: string;
    flight?: VerifiedFlight;
    tripDate?: string;
    isReturnLeg?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = body.paymentReference?.trim() ?? "";
  const flight = body.flight;
  if (!paymentReference || !flight?.flightNumber) {
    return jsonResponse({ error: "paymentReference and flight required" }, 400, origin);
  }

  const isReturnLeg = body.isReturnLeg === true;
  const kvKey = driverFlightAlertKvKey(paymentReference, isReturnLeg);
  let previous: DriverFlightAlertSnapshot | null = null;
  try {
    const raw = await env.TRACKING_STORE.get(kvKey);
    if (raw) previous = JSON.parse(raw) as DriverFlightAlertSnapshot;
  } catch {
    previous = null;
  }

  const decision = decideDriverFlightAlert({
    flightNumber: flight.flightNumber,
    statusCategory: flight.statusCategory,
    statusLabel: flight.statusLabel,
    estimatedTime: flight.estimatedTime,
    actualTime: flight.actualTime,
    delayMinutes: flight.delayMinutes,
    previous,
  });

  if (!decision.send) {
    return jsonResponse({ ok: true, alerted: false, reason: "no_change" }, 200, origin);
  }

  const recipient = await resolveDriverNotifyEmail(env, paymentReference);
  const to = recipient?.email || "bookings@myairporttaxini.co.uk";
  const name = recipient?.driverName || "Owner";
  const jobLine = `Job ref: ${paymentReference}${body.tripDate ? ` · ${body.tripDate}` : ""}`;

  const sendResult = await trySendEmail(env, {
    to,
    subject: decision.subject,
    body: `Hi ${name},\n\n${decision.body}\n\n${jobLine}\n\nMy Airport Taxi NI`,
    htmlBody: `<p>Hi ${name},</p><p>${decision.body.replace(/\n/g, "<br/>")}</p><p>${jobLine}</p><p>My Airport Taxi NI</p>`,
  });

  await env.TRACKING_STORE.put(kvKey, JSON.stringify(decision.nextSnapshot), {
    expirationTtl: 60 * 60 * 24 * 14,
  });

  return jsonResponse(
    {
      ok: true,
      alerted: true,
      kind: decision.kind,
      to,
      emailed: sendResult.sent === true,
      emailError: sendResult.sent ? undefined : sendResult.error,
    },
    200,
    origin,
  );
}
