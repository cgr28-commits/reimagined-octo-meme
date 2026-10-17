import { listAllBookingJobs } from "./booking-job-store";
import { isOwnerOperationalTestBooking } from "../shared/upcoming-jobs";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { corsHeaders } from "../shared/google-places";
import { marketingReportRow } from "../shared/marketing-report";
import { listRecentPaidBookings } from "./paid-booking-store";
import { eligibleAdvertisingConsent } from "./measurement-consent";
export async function handleMarketingReport(
  request: Request,
  env: DriverAuthEnv & { TRACKING_STORE?: KVNamespace },
  origin: string | null,
) {
  const headers = {
    ...corsHeaders(origin),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (request.method !== "GET")
    return new Response("{}", { status: 405, headers });
  if (!ownerAuthorized(request, env))
    return new Response("{}", { status: 401, headers });
  if (!env.TRACKING_STORE) return new Response("{}", { status: 503, headers });
  const raw = Number(new URL(request.url).searchParams.get("days") || 30);
  const days = Number.isFinite(raw)
    ? Math.min(90, Math.max(1, Math.trunc(raw)))
    : 30;
  const records = await listRecentPaidBookings(env.TRACKING_STORE, {
    days,
    limit: 200,
  });
  const cutoff = Date.now() - days * 86400000;
  const paid = records.filter(
    (r) =>
      Date.parse(r.createdAt) >= cutoff &&
      !!r.checkoutId &&
      !r.isRefundTest &&
      !r.isAmendmentTestFixture,
  );
  const jobs = await listAllBookingJobs(env.TRACKING_STORE);
  const refs = new Set(
    paid.flatMap((r) => [r.paymentReference, r.customerReference]).filter((r): r is string => !!r),
  );
  const unpaidRequests = jobs.filter(
    (j) =>
      Date.parse(j.createdAt) >= cutoff &&
      j.kind === "booking-request" &&
      j.status !== "paid" &&
      !refs.has(j.paymentReference || "") &&
      !refs.has(j.id) &&
      !isOwnerOperationalTestBooking({ paymentReference: j.id }),
  ).length;
  const rows = await Promise.all(
    paid.map(async (r) =>
      marketingReportRow(
        r,
        Boolean(
          await eligibleAdvertisingConsent(
            env.TRACKING_STORE,
            r.attribution?.consent,
          ),
        ),
      ),
    ),
  );
  return new Response(
    JSON.stringify({
      days,
      rows,
      unpaidRequests,
      totalRecordedBookings: rows.length + unpaidRequests,
      possiblyTruncated: records.length >= 200 || jobs.length >= 2000,
      scope:
        "Verified paid-booking records by payment-created date. Maximum 200; Unpaid/cancelled requests are counted separately and excluded from revenue. Cancelled/refunded paid bookings remain visible.",
    }),
    { headers },
  );
}
