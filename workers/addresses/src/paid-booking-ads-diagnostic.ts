/** Owner-only non-importing validation. Does not write booking/conversion state. */
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { getPaidBookingRecord } from "./paid-booking-store";
import { uploadPaidBookingClickConversion, type GoogleAdsClickConversionEnv } from "../shared/google-ads-click-conversions";
import { corsHeaders } from "../shared/google-places";

type Env = DriverAuthEnv & GoogleAdsClickConversionEnv & { TRACKING_STORE?: KVNamespace };
export async function handlePaidBookingAdsDiagnostic(request: Request, env: Env, origin: string | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (!ownerAuthorized(request, env)) return reply({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!env.TRACKING_STORE) return reply({ error: "Booking store unavailable" }, 503);
  const body = await request.json().catch(() => null) as { paymentReference?: unknown } | null;
  const ref = typeof body?.paymentReference === "string" ? body.paymentReference.trim() : "";
  if (!ref || ref.length > 120) return reply({ error: "Invalid payment reference" }, 400);
  const record = await getPaidBookingRecord(env.TRACKING_STORE, ref);
  if (!record) return reply({ error: "Booking not found" }, 404);
  if (record.isRefundTest || record.isAmendmentTestFixture || record.cancelledAt || record.refundedAt || record.status !== "confirmed") {
    return reply({ error: "Only active paid bookings can be validated" }, 409);
  }
  const time = new Date(record.createdAt);
  if (Number.isNaN(time.getTime())) return reply({ error: "Original payment time unavailable" }, 409);
  const outcome = await uploadPaidBookingClickConversion(env, {
    attribution: record.attribution,
    orderId: record.googleAdsPaidConversionOrderId || record.paymentReference,
    conversionValue: typeof record.totalFare === "number" && record.totalFare > 0 ? record.totalFare : record.amount,
    currencyCode: record.currency, conversionTime: time, validateOnly: true,
  });
  // No click identifier, customer details, credentials or Google response values are returned.
  return reply({ validationOnly: true, status: outcome.status, detail: outcome.error || outcome.rawSummary || outcome.status });
}
