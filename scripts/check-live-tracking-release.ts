import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyJourneyAction, buildPublicTrackUrl, type TrackingJobRecord } from "../shared/tracking";
import { publicTrackPayload } from "../workers/addresses/src/tracking-handlers";
import { handleJourneyTransitionRequest } from "../workers/addresses/src/journey-handlers";
import { buildCustomerConfirmationEmail, buildDriverOnTheWayEmail, buildUpdatedBookingConfirmationEmail } from "../shared/booking-notifications";
import { evaluateJourneyReminder } from "../shared/journey-reminder";
import { evaluateAirportPickupReminder } from "../shared/airport-pickup-reminder";

const token = "a".repeat(32), trackUrl = buildPublicTrackUrl(token);
const receipt = { customerName: "Private Test", customerEmail: "test@example.com", mobileNumber: "07700900000", tripLabel: "Airport transfer", pickupLabel: "Belfast International Airport", dropoffLabel: "Belfast", returnJourney: false, tripDate: "2026-10-21", tripTime: "02:00", returnDate: "", returnTime: "", passengers: 2, suitcases: 2, vehicle: "Estate", isAirportTrip: true, airportCode: "BFS", amountPaid: "£70.00", paymentReference: "TEST-ONLY", checkoutReference: "TEST-ONLY" };
// Website tracking is retired: callers may still pass a track URL, but no customer email shows it.
for (const email of [buildCustomerConfirmationEmail(receipt, undefined, { trackUrl }), buildUpdatedBookingConfirmationEmail(receipt, undefined, { trackUrl }), buildDriverOnTheWayEmail({ customerName: "Private Test", trackUrl })]) {
  assert.ok(!email.text.includes("/track/"));
  assert.ok(!email.html.includes("/track/"));
  assert.doesNotMatch(email.text + email.html, /track your driver/i);
  assert.doesNotMatch(email.text, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY|here on WhatsApp/);
}
const reminderInput = { ...receipt, customerReference: "MAT-1234", isFromAirport: true, airportAccessOption: "express" as const, outboundAirportAccessOption: "express" as const, bookingStatus: "confirmed" };
const now = new Date("2026-10-20T23:00:00Z");
for (const decision of [evaluateJourneyReminder(reminderInput, now), evaluateAirportPickupReminder(reminderInput, now)]) {
  assert.equal(decision.eligible, true);
  if (decision.eligible) { assert.ok(!decision.text.includes("/track/")); assert.doesNotMatch(decision.html, /track your driver/i); }
}
const data = readFileSync("src/lib/data.ts", "utf8");
assert.match(data, /liveDriverTracking:\s*false/);

const pickup = new Date(Date.now() + 2 * 3600_000);
const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(pickup);
const p = (type: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === type)!.value;
const tripDate = `${p("year")}-${p("month")}-${p("day")}`, tripTime = `${p("hour")}:${p("minute")}`;
let job: TrackingJobRecord = { token, createdAt: new Date().toISOString(), customerName: "Private Test", customerMobile: "", pickupLabel: "A", dropoffLabel: "B", tripDate, tripTime, pickupAt: `${tripDate}T${tripTime}`, sharingActive: false, driverLat: 54.6, driverLng: -5.9, driverUpdatedAt: new Date().toISOString() };
assert.equal(publicTrackPayload(job, null).driver, null);
assert.equal(publicTrackPayload({ ...job, sharingActive: true }, null).driver, null, "No live position before Driver on the way");
const started = applyJourneyAction(job, "start_tracking"); assert.ok(started.ok); if (!started.ok) throw Error("start failed"); job = started.job;
assert.equal(publicTrackPayload(job, null).driver?.lat, 54.6, "Early departure can activate link before the old one-hour opening");
assert.equal(publicTrackPayload({ ...job, driverUpdatedAt: new Date(Date.now() - 3600_000).toISOString() }, null).driver, null);
assert.equal(publicTrackPayload({ ...job, driverUpdatedAt: new Date(Date.now() - 91_000).toISOString() }, null).driver, null);
for (const action of ["stop_tracking", "complete_journey"] as const) {
  const ended = applyJourneyAction(job, action); assert.ok(ended.ok);
  if (ended.ok) assert.equal(publicTrackPayload(ended.job, null).driver, null);
}
console.log("PASS tracking retired from customer emails and reminders; track API activation gate, freshness, stop and completion unchanged. No network calls or real bookings.");

void (async () => {
  const data = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) { const value = data.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; },
    async put(key: string, value: string) { data.set(key, value); },
    async delete(key: string) { data.delete(key); },
    async list() { return { keys: [], list_complete: true }; },
  };
  const assigned = { ...job, assignedDriverName: "Driver", assignmentStatus: "accepted" };
  data.set(`track:job:${token}`, JSON.stringify(assigned));
  const env = { TRACKING_STORE: store as unknown as KVNamespace, DRIVER_ACCESS_KEY: "test-driver", OWNER_ACCESS_KEY: "test-owner" };
  const request = new Request("https://test.invalid/driver/journey/transition", { method: "POST", headers: { "Content-Type": "application/json", "X-Driver-Key": "test-driver" }, body: JSON.stringify({ token, action: "stop_tracking" }) });
  const response = await handleJourneyTransitionRequest(request, env, null);
  assert.equal(response.status, 200, await response.text());
  const stopped = JSON.parse(data.get(`track:job:${token}`)!);
  assert.equal(stopped.sharingActive, false);
  assert.equal(publicTrackPayload(stopped, null).driver, null);
  console.log("PASS assigned driver can stop tracking through the authenticated transition endpoint.");
})();
