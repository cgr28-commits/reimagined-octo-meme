import { corsHeaders } from "../shared/google-places";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  getSumUpCheckout,
  isSumUpCheckoutPaid,
  resolveAuthoritativeSumUpTransaction,
} from "../shared/sumup-checkout";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  fillMissingPaidBookingTransactionMetadata,
  getPaidBookingRecord,
  getPaidBookingRecordByCheckoutId,
  listRecentPaidBookings,
  paidBookingStoreConfigured,
} from "./paid-booking-store";

export type SumUpTransactionReconcileStatus =
  | "repaired"
  | "already_complete"
  | "unresolved"
  | "error";

export type SumUpTransactionReconcileResult = {
  status: SumUpTransactionReconcileStatus;
  paymentReference: string;
  checkoutId: string;
  customerReference?: string;
  transactionId?: string;
  transactionCode?: string;
  error?: string;
};

type ReconcileEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
};

function resultBase(
  record: Pick<PaidBookingRecord, "paymentReference" | "checkoutId" | "customerReference">,
): Pick<
  SumUpTransactionReconcileResult,
  "paymentReference" | "checkoutId" | "customerReference"
> {
  return {
    paymentReference: record.paymentReference,
    checkoutId: record.checkoutId?.trim() ?? "",
    ...(record.customerReference?.trim()
      ? { customerReference: record.customerReference.trim() }
      : {}),
  };
}

/**
 * Read SumUp for one stored paid booking and fill blank transaction id/code.
 * Never creates a checkout, charges, refunds, or changes fare/status.
 */
export async function reconcilePaidBookingSumUpTransaction(input: {
  apiKey: string;
  merchantCode?: string;
  store: KVNamespace;
  record: PaidBookingRecord;
}): Promise<SumUpTransactionReconcileResult> {
  const base = resultBase(input.record);
  const transactionId = input.record.transactionId?.trim() ?? "";
  const transactionCode = input.record.transactionCode?.trim() ?? "";
  if (transactionId && transactionCode) {
    return {
      ...base,
      status: "already_complete",
      transactionId,
      transactionCode,
    };
  }

  const checkoutId = input.record.checkoutId?.trim() ?? "";
  if (!checkoutId) {
    return { ...base, status: "error", error: "Missing SumUp checkout id" };
  }

  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return { ...base, status: "error", error: "SumUp payment is not configured" };
  }

  let checkout;
  try {
    checkout = await getSumUpCheckout(apiKey, checkoutId);
  } catch {
    console.log("[sumup-transaction] reconcile checkout lookup failed", {
      checkoutId,
      paymentReference: input.record.paymentReference,
    });
    return { ...base, status: "error", error: "Could not retrieve SumUp checkout" };
  }

  if (checkout.id?.trim() !== checkoutId) {
    return {
      ...base,
      status: "error",
      error: "SumUp checkout id did not match this booking",
    };
  }

  if (!isSumUpCheckoutPaid(checkout)) {
    return {
      ...base,
      status: "error",
      error: "SumUp has not confirmed this checkout is paid",
    };
  }

  const resolved = await resolveAuthoritativeSumUpTransaction({
    apiKey,
    merchantCode: input.merchantCode,
    checkout,
    paymentReference: input.record.paymentReference,
  });

  if (!resolved.transactionId && !resolved.transactionCode) {
    return {
      ...base,
      status: "unresolved",
      ...(transactionId ? { transactionId } : {}),
      ...(transactionCode ? { transactionCode } : {}),
      error: "SumUp confirmed the checkout is paid but did not return a transaction id",
    };
  }

  const filled = await fillMissingPaidBookingTransactionMetadata(
    input.store,
    input.record.paymentReference,
    {
      transactionId: resolved.transactionId,
      transactionCode: resolved.transactionCode,
    },
  );

  if (!filled) {
    return { ...base, status: "error", error: "Paid booking record was not found" };
  }

  if (filled.filled.length === 0) {
    return {
      ...base,
      status: transactionId ? "already_complete" : "unresolved",
      transactionId: filled.record.transactionId,
      transactionCode: filled.record.transactionCode,
      ...(transactionId
        ? {}
        : { error: "SumUp confirmed the checkout is paid but did not return a transaction id" }),
    };
  }

  console.log("[sumup-transaction] paid booking transaction metadata repaired", {
    checkoutId,
    paymentReference: input.record.paymentReference,
    customerReference: input.record.customerReference,
    filled: filled.filled.join(","),
  });

  return {
    ...base,
    status: "repaired",
    transactionId: filled.record.transactionId,
    transactionCode: filled.record.transactionCode,
  };
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

export function isReconcileSumUpTransactionsPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/reconcile-transactions" ||
    pathname === "/api/paid-bookings/reconcile-transactions"
  );
}

/**
 * Owner-only, on-demand metadata repair. Not called from cron.
 * Operates only on bookings already stored as paid.
 */
export async function handleReconcileSumUpTransactionsRequest(
  request: Request,
  env: ReconcileEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to reconcile SumUp transaction ids." },
      401,
      origin,
    );
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return jsonResponse({ error: "SumUp payment is not configured" }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  const checkoutId = String(body.checkoutId ?? "").trim();
  const scan = body.scan === true;
  const store = env.TRACKING_STORE;

  let records: PaidBookingRecord[] = [];
  if (paymentReference || checkoutId) {
    const record = paymentReference
      ? await getPaidBookingRecord(store, paymentReference)
      : await getPaidBookingRecordByCheckoutId(store, checkoutId);
    if (!record) {
      return jsonResponse({ error: "Paid booking was not found." }, 404, origin);
    }
    records = [record];
  } else if (scan) {
    const days = Math.min(Math.max(Number(body.days ?? 2) || 2, 1), 14);
    const limit = Math.min(Math.max(Number(body.limit ?? 40) || 40, 1), 100);
    records = await listRecentPaidBookings(store, { days, limit });
  } else {
    return jsonResponse(
      { error: "Provide paymentReference, checkoutId, or scan: true." },
      400,
      origin,
    );
  }

  const results: SumUpTransactionReconcileResult[] = [];
  for (const record of records) {
    results.push(
      await reconcilePaidBookingSumUpTransaction({
        apiKey,
        merchantCode: env.SUMUP_MERCHANT_CODE,
        store,
        record,
      }),
    );
  }

  return jsonResponse(
    {
      ok: true,
      count: results.length,
      repaired: results.filter((item) => item.status === "repaired").length,
      alreadyComplete: results.filter((item) => item.status === "already_complete").length,
      unresolved: results.filter((item) => item.status === "unresolved").length,
      errors: results.filter((item) => item.status === "error").length,
      results,
    },
    200,
    origin,
  );
}
