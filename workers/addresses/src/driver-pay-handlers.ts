/**
 * Owner-only driver payment ledger.
 * Records money the owner has already paid. Does not send money.
 */

import { corsHeaders } from "../shared/google-places";
import {
  correctDriverPayToUnpaid,
  driverPayAmountLabel,
  durableRecordToSummaryJob,
  formatDriverPayFromPence,
  mutateDriverPayFields,
  recordDriverAsPaid,
  summariseDriverPay,
  toDurableDriverPayRecord,
  type DriverPayLedgerState,
  type DriverPayPeriod,
  type DurableDriverPayRecord,
} from "../shared/driver-pay-ledger";
import { journeyStatusOf, type TrackingJobRecord } from "../shared/tracking";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { enrichDriverJob } from "./driver-booking-handlers";
import { getDurableDriverPay, listDurableDriverPay, upsertDriverPayLedger } from "./driver-pay-store";
import { syncDurableDriverPayFromTracking } from "./driver-pay-sync";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import {
  getTrackingJob,
  isTrackingJobCancelled,
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
  const records = await listDurableDriverPay(store);
  const summary = summariseDriverPay(records.map(durableRecordToSummaryJob), period);
  return jsonResponse({ ok: true, ...summary }, 200, origin);
}

function ledgerFromDurable(record: DurableDriverPayRecord): DriverPayLedgerState {
  return {
    driverPayAmount: formatDriverPayFromPence(record.driverPayAmountPence),
    driverPayAmountPence: record.driverPayAmountPence,
    driverPayStatus: record.status,
    driverPayPaidAt: record.paidAt,
    driverPayMethod: record.paymentMethod,
    driverPayProviderReference: record.paymentReference,
    driverPayStatusUpdatedAt: record.statusUpdatedAt,
    driverPayDriverProfileKey: record.driverProfileKey,
    driverPayDriverName: record.driverName,
  };
}

function applyLedgerToDurable(
  existing: DurableDriverPayRecord,
  ledger: DriverPayLedgerState,
): DurableDriverPayRecord | null {
  return toDurableDriverPayRecord({
    token: existing.trackingToken,
    tripDate: existing.tripDate,
    pickupLabel: existing.pickupLabel,
    dropoffLabel: existing.dropoffLabel,
    journeyLeg: existing.journeyLeg,
    bookingReference: existing.bookingReference,
    driverPayAmount: ledger.driverPayAmount,
    driverPayAmountPence: ledger.driverPayAmountPence,
    driverPayStatus: ledger.driverPayStatus,
    driverPayPaidAt: ledger.driverPayPaidAt,
    driverPayMethod: ledger.driverPayMethod,
    driverPayProviderReference: ledger.driverPayProviderReference,
    driverPayStatusUpdatedAt: ledger.driverPayStatusUpdatedAt,
    driverPayDriverProfileKey: ledger.driverPayDriverProfileKey ?? existing.driverProfileKey,
    driverPayDriverName: ledger.driverPayDriverName ?? existing.driverName,
  });
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
  const nowIso = new Date().toISOString();
  const tracking = await getTrackingJob(store, token);
  if (tracking) {
    const result = recordDriverAsPaid(tracking, {
      method,
      reference,
      nowIso,
      journeyCompleted: journeyStatusOf(tracking) === "completed",
      cancelled: await journeyCancelled(store, tracking),
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status, origin);
    }
    if (!result.idempotent) {
      mutateDriverPayFields(tracking, result.record);
      await saveTrackingJob(store, tracking);
    }
    await syncDurableDriverPayFromTracking(store, tracking);
    const job = await enrichDriverJob(tracking, env, origin, "owner");
    return jsonResponse({ ok: true, idempotent: result.idempotent, job }, 200, origin);
  }

  const durable = await getDurableDriverPay(store, token);
  if (!durable) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }
  const settled = recordDriverAsPaid(ledgerFromDurable(durable), {
    method,
    reference,
    nowIso,
    journeyCompleted: durable.status === "unpaid" || durable.status === "paid",
    cancelled: false,
  });
  if (!settled.ok) {
    return jsonResponse({ error: settled.error }, settled.status, origin);
  }
  if (!settled.idempotent) {
    const next = applyLedgerToDurable(durable, settled.record);
    if (!next) {
      return jsonResponse({ error: "This journey has no driver pay amount to record." }, 409, origin);
    }
    await upsertDriverPayLedger(store, next);
  }
  return jsonResponse({ ok: true, idempotent: settled.idempotent }, 200, origin);
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
  const nowIso = new Date().toISOString();
  const tracking = await getTrackingJob(store, token);
  if (tracking) {
    const result = correctDriverPayToUnpaid(tracking, {
      nowIso,
      journeyCompleted: journeyStatusOf(tracking) === "completed",
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status, origin);
    }
    mutateDriverPayFields(tracking, result.record);
    await saveTrackingJob(store, tracking);
    await syncDurableDriverPayFromTracking(store, tracking);
    const job = await enrichDriverJob(tracking, env, origin, "owner");
    return jsonResponse(
      {
        ok: true,
        job,
        driverPayAmount: driverPayAmountLabel(tracking),
      },
      200,
      origin,
    );
  }

  const durable = await getDurableDriverPay(store, token);
  if (!durable) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }
  const corrected = correctDriverPayToUnpaid(ledgerFromDurable(durable), {
    nowIso,
    journeyCompleted: true,
  });
  if (!corrected.ok) {
    return jsonResponse({ error: corrected.error }, corrected.status, origin);
  }
  const next = applyLedgerToDurable(durable, corrected.record);
  if (!next) {
    return jsonResponse({ error: "This journey has no driver pay amount to record." }, 409, origin);
  }
  await upsertDriverPayLedger(store, next);
  return jsonResponse(
    {
      ok: true,
      driverPayAmount: formatDriverPayFromPence(next.driverPayAmountPence),
    },
    200,
    origin,
  );
}
