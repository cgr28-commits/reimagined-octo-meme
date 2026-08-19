/**
 * Owner-only £1 live SumUp refund smoke-test facility.
 *
 * Reuses existing SumUp Hosted Checkout + PR #339 refund coordinator.
 * Does NOT alter normal pricing or create real journeys.
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import { formatPaidAmount } from "../shared/booking-notifications";
import {
  createSumUpHostedCheckout,
} from "../shared/sumup-checkout";
import {
  remainingRefundableBalance,
  resolveOperationalStatus,
  resolvePaymentStatusFromRecord,
  roundGbp,
} from "../shared/refund-ops";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  getPaidBookingRecord,
  listRefundTestPaidBookings,
  paidBookingStoreConfigured,
} from "./paid-booking-store";
import { savePendingCheckout, listRecentPendingCheckouts } from "./pending-checkout-store";
import { handleRefundRequest, syncPaidBookingRefundTotalsFromSumUp } from "./refund-handlers";
import type { RefundEnv } from "./refund-handlers";

/** Hard-coded live test charge — never taken from the browser. */
export const REFUND_TEST_AMOUNT_GBP = 1;

type RefundTestEnv = DriverAuthEnv & {
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  TRACKING_STORE?: KVNamespace;
  BOOKING_TO_EMAIL?: string;
  REFUND_COORDINATOR?: DurableObjectNamespace;
  RESEND_API_KEY?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  BOOKING_FROM_EMAIL?: string;
  EMAIL?: {
    send(message: {
      to: string;
      from: string | { email: string; name?: string };
      subject: string;
      text?: string;
      replyTo?: string | { email: string; name?: string };
    }): Promise<{ messageId?: string }>;
  };
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
};

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function buildRefundTestBooking(checkoutReference: string): PaidBookingDetails {
  const now = new Date();
  const tripDate = now.toISOString().slice(0, 10);
  return {
    customerName: "REFUND TEST (Owner)",
    customerEmail: "bookings@myairporttaxini.co.uk",
    mobileNumber: "07700000000",
    tripLabel: `[REFUND TEST £1] ${checkoutReference}`,
    pickupLabel: "REFUND TEST — not a real pickup",
    dropoffLabel: "REFUND TEST — not a real drop-off",
    returnJourney: false,
    tripDate,
    tripTime: "12:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 1,
    suitcases: 0,
    vehicle: "Saloon",
    isAirportTrip: false,
  };
}

export function isRefundTestCheckoutPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/refund-test/checkout" ||
    pathname === "/api/paid-bookings/refund-test/checkout"
  );
}

export function isRefundTestListPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/refund-test/list" ||
    pathname === "/api/paid-bookings/refund-test/list"
  );
}

export function isRefundTestRefundPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/refund-test/refund" ||
    pathname === "/api/paid-bookings/refund-test/refund"
  );
}

/**
 * Create a fixed £1.00 SumUp Hosted Checkout for owner refund smoke testing.
 * Amount is hard-coded server-side — browser amount is ignored.
 */
export async function handleRefundTestCheckoutRequest(
  request: Request,
  env: RefundTestEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — Refund Test requires OWNER_ACCESS_KEY." },
      401,
      origin,
    );
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return jsonResponse({ error: "SumUp is not configured on the Worker." }, 503, origin);
  }
  if (!env.TRACKING_STORE) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // Ignore any client-supplied amount — always £1.00.
  const clientAmount = body.amount != null ? Number(body.amount) : null;
  if (clientAmount != null && Number.isFinite(clientAmount) && Math.abs(clientAmount - 1) > 0.001) {
    return jsonResponse(
      {
        error:
          "Refund Test amount is fixed at £1.00 server-side. Do not send a different amount.",
      },
      400,
      origin,
    );
  }

  const amount = REFUND_TEST_AMOUNT_GBP;
  const checkoutReference =
    `REFUND-TEST-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`.toUpperCase();
  const redirectUrl =
    String(body.redirectUrl ?? "").trim() ||
    "https://www.myairporttaxini.co.uk/owner/refund-test/?payment=return";
  const workerOrigin = new URL(request.url).origin;
  const returnUrl = `${workerOrigin}/payments/webhook`;

  const booking = buildRefundTestBooking(checkoutReference);
  const description = `[REFUND TEST £1] LIVE SumUp smoke test ${checkoutReference}`.slice(0, 140);

  let checkout: Awaited<ReturnType<typeof createSumUpHostedCheckout>>;
  try {
    checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount,
      description,
      checkoutReference,
      redirectUrl,
      returnUrl,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "SumUp checkout creation failed",
      },
      502,
      origin,
    );
  }

  await savePendingCheckout(env.TRACKING_STORE, {
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    amount,
    booking,
    createdAt: new Date().toISOString(),
    isRefundTest: true,
  });

  return jsonResponse(
    {
      ok: true,
      isRefundTest: true,
      amount,
      amountLabel: formatPaidAmount(amount, "GBP"),
      checkoutId: checkout.checkoutId,
      checkoutReference: checkout.checkoutReference,
      paymentUrl: checkout.paymentUrl,
      warning: "LIVE SUMUP TEST — REAL £1 PAYMENT AND REAL REFUND",
    },
    200,
    origin,
  );
}

export async function handleRefundTestListRequest(
  request: Request,
  env: RefundTestEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — Refund Test requires OWNER_ACCESS_KEY." },
      401,
      origin,
    );
  }
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const bookings = await listRefundTestPaidBookings(env.TRACKING_STORE, { limit: 40 });
  const pendingAll = await listRecentPendingCheckouts(env.TRACKING_STORE, { limit: 80 });
  const pendingTests = pendingAll
    .filter((p) => p.isRefundTest && !p.finalizedAt)
    .slice(0, 20)
    .map((p) => ({
      checkoutId: p.checkoutId,
      checkoutReference: p.checkoutReference,
      amount: p.amount,
      createdAt: p.createdAt,
      isRefundTest: true as const,
      status: "pending_payment",
    }));

  // Sync each test booking from SumUp so a processor-full refund cannot leave
  // a false local remaining balance (do not attempt further refunds).
  const items = [];
  for (const booking of bookings) {
    const synced = await syncPaidBookingRefundTotalsFromSumUp(
      env as RefundEnv,
      booking,
    );
    const record = synced.record;
    const amountPaid =
      typeof record.amount === "number" && record.amount > 0
        ? roundGbp(record.amount)
        : 0;
    const amountRefunded =
      typeof record.amountRefunded === "number" ? roundGbp(record.amountRefunded) : 0;
    items.push({
      paymentReference: record.paymentReference,
      checkoutId: record.checkoutId,
      transactionId: record.transactionId ?? null,
      transactionCode: record.transactionCode ?? null,
      amountPaid,
      amountPaidLabel: record.amountPaidLabel,
      amountRefunded,
      remainingRefundable: remainingRefundableBalance(amountPaid, amountRefunded),
      status: record.status,
      operationalStatus: resolveOperationalStatus(record),
      paymentStatus:
        record.paymentStatus ??
        resolvePaymentStatusFromRecord({
          amountPaid,
          amountRefunded,
          status: record.status,
          paymentStatus: record.paymentStatus,
        }),
      createdAt: record.createdAt,
      refundedAt: record.refundedAt ?? null,
      isRefundTest: true as const,
      refundHistoryCount: record.refundHistory?.length ?? 0,
      tripLabel: record.tripLabel,
      syncedFromProcessor: synced.syncedFromProcessor,
    });
  }

  return jsonResponse(
    {
      ok: true,
      coordinatorConfigured: Boolean(env.REFUND_COORDINATOR),
      sumUpConfigured: Boolean(env.SUMUP_API_KEY?.trim() && env.SUMUP_MERCHANT_CODE?.trim()),
      warning: "LIVE SUMUP TEST — REAL £1 PAYMENT AND REAL REFUND",
      bookings: items,
      pendingCheckouts: pendingTests,
    },
    200,
    origin,
  );
}

/**
 * Issue a refund against an isRefundTest booking only — delegates to the same
 * /bookings/refund → REFUND_COORDINATOR path with refundTest: true.
 */
export async function handleRefundTestRefundRequest(
  request: Request,
  env: RefundTestEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — Refund Test requires OWNER_ACCESS_KEY." },
      401,
      origin,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Missing paymentReference" }, 400, origin);
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record) {
    return jsonResponse({ error: "Refund test booking not found." }, 404, origin);
  }
  if (!record.isRefundTest) {
    return jsonResponse(
      {
        error:
          "Refund Test endpoint cannot refund a normal customer booking. Use the normal Cancel/Refund flow.",
      },
      400,
      origin,
    );
  }

  // Force keep-active partial/full refunds for the smoke test (no fake journey to cancel).
  const amount =
    body.amount != null && Number.isFinite(Number(body.amount))
      ? roundGbp(Number(body.amount))
      : null;
  const refundFullRemaining = body.refundFullRemaining === true || amount == null;

  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      paymentReference,
      confirmOwnerKey: body.confirmOwnerKey,
      idempotencyKey: body.idempotencyKey,
      amount: refundFullRemaining ? null : amount,
      refundFullRemaining,
      cancelBooking: false,
      actionKind: refundFullRemaining
        ? "full_refund_keep_active"
        : "partial_refund_keep_active",
      reasonCategory: "other",
      ownerNotes: String(body.ownerNotes ?? "Owner £1 live SumUp refund test"),
      customerFacingReason: "",
      refundTest: true,
    }),
  });

  return handleRefundRequest(forwarded, env, origin);
}
