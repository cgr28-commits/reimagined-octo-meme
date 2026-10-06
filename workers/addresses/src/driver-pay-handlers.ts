/**
 * Owner-only driver payment ledger.
 * Records money the owner has already paid. Does not send money.
 */

import { corsHeaders } from "../shared/google-places";
import {
  correctDriverPayToUnpaid,
  driverPayAmountLabel,
  mutateDriverPayFields,
  recordDriverAsPaid,
  summariseDriverPay,
  type DriverPayPeriod,
  type DriverPaySummaryJob,
} from "../shared/driver-pay-ledger";
import { journeyStatusOf, type TrackingJobRecord } from "../shared/tracking";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { enrichDriverJob } from "./driver-booking-handlers";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import {
  getTrackingJob,
  isTrackingJobCancelled,
  listTrackingJobsForRecentDays,
  listUpcomingTrackingJobs,
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

export function isOwnerDriverPaymentsPath(pathname: string): boolean {
  return pathname === "/owner/driver-payments" || pathname === "/api/owner/driver-payments";
}

export function isOwnerDriverPaymentsRecordPath(pathname: string): boolean {
  return (
    pathname === "/owner/driver-payments/record" ||
    pathname === "/api/owner/driver-payments/record"
  );
}

export function isOwnerDriverPaymentsCorrectPath(pathname: string): boolean {
  return (
    pathname === "/owner/driver-payments/correct" ||
    pathname === "/api/owner/driver-payments/correct"
  );
}

function parsePeriod(value: string): DriverPayPeriod {
  if (value === "week" || value === "year" || value === "month") return value;
  return "month";
}

async function journeyCancelled(store: KVNamespace, job: TrackingJobRecord): Promise<boolean> {
  if (isTrackingJobCancelled(job)) return true;
  const paymentReference = job.paymentReference?.trim();
  if (!paymentReference || !paidBookingStoreConfigured(store)) return false;
  const paid = await getPaidBookingRecord(store, paymentReference);
  return paid?.status === "cancelled" || paid?.status === "refunded";
}

async function customerReference(store: KVNamespace, job: TrackingJobRecord): Promise<string | undefined> {
  const paymentReference = job.paymentReference?.trim();
  if (!paymentReference || !paidBookingStoreConfigured(store)) return undefined;
  const paid = await getPaidBookingRecord(store, paymentReference);
  return paid?.customerReference?.trim() || undefined;
}

export async function handleOwnerDriverPaymentsSummaryRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  const period = parsePeriod(new URL(request.url).searchParams.get("period")?.trim() || "month");
  const store = env.TRACKING_STORE;
  const [recent, upcoming] = await Promise.all([
    listTrackingJobsForRecentDays(store, 370),
    listUpcomingTrackingJobs(store, 120),
  ]);
  const byToken = new Map<string, TrackingJobRecord>();
  for (const job of [...recent, ...upcoming]) {
    byToken.set(job.token, job);
  }

  const jobs: DriverPaySummaryJob[] = [];
  for (const job of byToken.values()) {
    const cancelled = await journeyCancelled(store, job);
    const reference = await customerReference(store, job);
    jobs.push({
      token: job.token,
      tripDate: job.tripDate,
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      journeyStatus: journeyStatusOf(job),
      refundedAt: job.refundedAt,
      assignedDriverName: job.assignedDriverName,
      journeyLeg: job.journeyLeg,
      cancelled,
      bookingReference: reference,
      driverPayAmount: job.driverPayAmount,
      driverPayAmountPence: job.driverPayAmountPence,
      driverPayStatus: job.driverPayStatus,
      driverPayPaidAt: job.driverPayPaidAt,
      driverPayDriverName: job.driverPayDriverName,
    });
  }

  const summary = summariseDriverPay(jobs, period);
  return jsonResponse({ ok: true, ...summary }, 200, origin);
}

async function readPayBody(
  request: Request,
  origin: string | null,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return { ok: true, body };
  } catch {
    return { ok: false, response: jsonResponse({ error: "Invalid JSON" }, 400, origin) };
  }
}

export async function handleRecordDriverPaidRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  const parsed = await readPayBody(request, origin);
  if (!parsed.ok) return parsed.response;
  const token = String(parsed.body.token ?? "").trim();
  const method = String(parsed.body.method ?? "");
  const reference = parsed.body.reference == null ? undefined : String(parsed.body.reference);
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const store = env.TRACKING_STORE;
  const record = await getTrackingJob(store, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  const nowIso = new Date().toISOString();
  const result = recordDriverAsPaid(record, {
    method,
    reference,
    nowIso,
    journeyCompleted: journeyStatusOf(record) === "completed",
    cancelled: await journeyCancelled(store, record),
  });
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status, origin);
  }
  if (!result.idempotent) {
    mutateDriverPayFields(record, result.record);
    await saveTrackingJob(store, record);
  }

  const job = await enrichDriverJob(record, env, origin, "owner");
  return jsonResponse({ ok: true, idempotent: result.idempotent, job }, 200, origin);
}

export async function handleCorrectDriverPaidRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  const parsed = await readPayBody(request, origin);
  if (!parsed.ok) return parsed.response;
  const token = String(parsed.body.token ?? "").trim();
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const store = env.TRACKING_STORE;
  const record = await getTrackingJob(store, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  const result = correctDriverPayToUnpaid(record, {
    nowIso: new Date().toISOString(),
    journeyCompleted: journeyStatusOf(record) === "completed",
  });
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status, origin);
  }
  mutateDriverPayFields(record, result.record);
  await saveTrackingJob(store, record);
  const job = await enrichDriverJob(record, env, origin, "owner");
  return jsonResponse(
    {
      ok: true,
      job,
      driverPayAmount: driverPayAmountLabel(record),
    },
    200,
    origin,
  );
}
