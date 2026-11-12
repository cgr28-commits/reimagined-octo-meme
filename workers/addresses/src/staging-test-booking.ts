/**
 * Staging only: create, change or delete a clearly-labelled test booking so the driver-job
 * tests have something to offer. Compiled out of the live Worker (STAGING_SANDBOX is false there),
 * owner sign-in required, and it can only ever touch bookings whose id starts "stg-test-".
 */
import { bookingJobKey, type BookingJobRecord } from "../shared/booking-job";
import { getBookingJob, saveBookingJob } from "./booking-job-store";
import { STAGING_SANDBOX } from "./staging-sandbox";

const PREFIX = "stg-test-";

export async function handleStagingTestBooking(
  request: Request,
  env: { TRACKING_STORE?: KVNamespace },
  ownerOk: boolean,
  cors: HeadersInit,
): Promise<Response | null> {
  if (!STAGING_SANDBOX) return null;
  const url = new URL(request.url);
  if (url.pathname !== "/staging/test-booking") return null;
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...Object.fromEntries(new Headers(cors)) } });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "Not found." }, 404);
  if (!ownerOk) return json({ ok: false, error: "Owner sign-in required." }, 401);
  const store = env.TRACKING_STORE;
  if (!store) return json({ ok: false, error: "Storage not configured." }, 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

  if (action === "create") {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const id = `${PREFIX}${stamp}`;
    const job: BookingJobRecord = {
      id,
      createdAt: new Date().toISOString(),
      status: "paid",
      kind: "booking-request",
      customerName: "Staging Test",
      customerEmail: "staging-test@example.com",
      customerMobile: "07700900555",
      tripLabel: "Staging test journey",
      pickupLabel: str(body.pickup, 120) || "1 Test Street, Belfast, BT1 1AA",
      dropoffLabel: str(body.dropoff, 120) || "Belfast International Airport",
      returnJourney: false,
      tripDate: str(body.tripDate, 10),
      tripTime: str(body.tripTime, 5),
      passengers: 2,
      suitcases: 2,
      vehicle: "Saloon",
      quotedPrice: "£185.00",
      amountPaidLabel: "£185.00",
      isAirportTrip: true,
      paidAt: new Date().toISOString(),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(job.tripDate) || !/^\d{2}:\d{2}$/.test(job.tripTime)) return json({ ok: false, error: "tripDate and tripTime are required." }, 400);
    await saveBookingJob(store, job);
    // No payment reference: the booking id is its reference, so it can be read back at once.
    return json({ ok: true, id, reference: id }, 201);
  }

  const id = str(body.id, 80);
  if (!id.startsWith(PREFIX)) return json({ ok: false, error: "Only staging test bookings can be changed here." }, 403);
  if (action === "delete") {
    await store.delete(bookingJobKey(id));
    return json({ ok: true }, 200);
  }
  if (action === "update") {
    const job = await getBookingJob(store, id);
    if (!job) return json({ ok: false, error: "Not found." }, 404);
    const next = { ...job };
    if (body.tripTime != null) next.tripTime = str(body.tripTime, 5);
    if (body.tripDate != null) next.tripDate = str(body.tripDate, 10);
    if (body.status === "cancelled" || body.status === "paid") next.status = body.status;
    await saveBookingJob(store, next);
    return json({ ok: true, driverAccountId: next.driverAccountId ?? "", driverFirstName: next.driverFirstName ?? "", assignment: next.driverAssignmentStatus ?? "" }, 200);
  }
  if (action === "read") {
    const job = await getBookingJob(store, id);
    if (!job) return json({ ok: false, error: "Not found." }, 404);
    return json({ ok: true, driverAccountId: job.driverAccountId ?? "", driverFirstName: job.driverFirstName ?? "", assignment: job.driverAssignmentStatus ?? "", status: job.status }, 200);
  }
  return json({ ok: false, error: "Unknown action." }, 400);
}
