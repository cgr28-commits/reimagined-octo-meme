import { formatDriverPayAmount, journeyStatusOf } from "../shared/tracking";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { getTrackingJob, saveTrackingJob, trackingStoreConfigured } from "./tracking-store";

type Env = DriverAuthEnv & { TRACKING_STORE?: KVNamespace };

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function validPaymentAmount(value: unknown): string | null {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  const match = raw.match(/^£?\s*(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return formatDriverPayAmount(String(amount));
}

/** Record an owner-confirmed manual payout. This never calls SumUp or changes customer payment data. */
export async function handleDriverPaymentRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Driver payments are not configured" }, 503, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const amount = validPaymentAmount(body.amount);
  if (!token || !amount) {
    return jsonResponse({ error: "Enter a valid driver payment amount" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) return jsonResponse({ error: "Job not found" }, 404, origin);
  if (journeyStatusOf(record) !== "completed") {
    return jsonResponse({ error: "The journey must be completed before payment is recorded" }, 409, origin);
  }

  if (record.driverPaymentStatus === "paid" || record.driverPaymentStatus === "sent") {
    return jsonResponse(
      {
        ok: true,
        payment: {
          status: record.driverPaymentStatus,
          amount: record.driverPaymentAmount,
          sentAt: record.driverPaymentSentAt,
          history: record.driverPaymentHistory ?? [],
        },
        idempotent: true,
      },
      200,
      origin,
    );
  }

  const sentAt = new Date().toISOString();
  record.driverPaymentStatus = "paid";
  record.driverPaymentAmount = amount;
  record.driverPaymentSentAt = sentAt;
  record.driverPaymentHistory = [
    ...(record.driverPaymentHistory ?? []),
    { at: sentAt, status: "paid", amount, actor: "owner" },
  ];
  await saveTrackingJob(env.TRACKING_STORE, record);

  return jsonResponse(
    {
      ok: true,
      payment: {
        status: record.driverPaymentStatus,
        amount: record.driverPaymentAmount,
        sentAt: record.driverPaymentSentAt,
        history: record.driverPaymentHistory,
      },
    },
    200,
    origin,
  );
}
