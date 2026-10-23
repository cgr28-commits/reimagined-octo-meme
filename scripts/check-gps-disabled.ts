/** Offline fictional contracts: no production data, provider credentials or customer messages. */
import assert from "node:assert/strict";
import { DASHBOARD_GPS_ENABLED } from "../shared/live-gps";
import { buildPublicTrackUrl, getTrackingWindow, resolveEmailTrackUrl, type TrackingJobRecord } from "../shared/tracking";
import { customerTrackingHtml, customerTrackingText } from "../shared/customer-tracking-email";
import { buildDriverOnTheWayEmail, buildDriverArrivedPickupEmail } from "../shared/booking-notifications";
import { handleJourneySessionRequest, handleJourneyTransitionRequest } from "../workers/addresses/src/journey-handlers";
import { handlePublicTrackRequest, handleDriverLocationRequest, handleDriverSharingRequest, handleCustomerLocationRequest, handleCustomerSharingRequest, publicTrackPayload } from "../workers/addresses/src/tracking-handlers";
import { processDueTrackingAvailableReminders } from "../workers/addresses/src/tracking-reminder-handlers";

async function main() {
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External network prohibited in GPS-off tests"); };
try {
  assert.equal(DASHBOARD_GPS_ENABLED, false);
  const forbiddenStore = new Proxy({}, { get() { throw new Error("Disabled GPS must not read or write any booking/location data"); } }) as KVNamespace;
  for (const handler of [handleDriverLocationRequest, handleDriverSharingRequest, handleCustomerLocationRequest, handleCustomerSharingRequest, handleJourneySessionRequest]) {
    const response = await handler(new Request("https://fictional.invalid/location", { method: "POST", body: "{}" }), { TRACKING_STORE: forbiddenStore }, null);
    assert.equal(response.status, 410);
  }
  assert.equal((await handlePublicTrackRequest("a".repeat(32), { TRACKING_STORE: forbiddenStore }, null)).status, 410);
  assert.equal((await processDueTrackingAvailableReminders({ TRACKING_STORE: forbiddenStore })).sent, 0);
  const token = "a".repeat(32);
  const job = {
    token, createdAt: new Date().toISOString(), customerName: "Fictional GPS test",
    customerMobile: "07000000000", pickupLabel: "Fictional pickup", dropoffLabel: "Fictional destination",
    tripDate: "2026-10-22", tripTime: "10:30", pickupAt: new Date().toISOString().slice(0, 16),
    trackingStartedAt: new Date().toISOString(),
    journeyStatus: "idle", sharingActive: true, customerSharingActive: true,
    driverLat: 54.6, driverLng: -5.9, driverUpdatedAt: new Date().toISOString(),
    customerLat: 54.6, customerLng: -5.9, customerUpdatedAt: new Date().toISOString(),
  } as TrackingJobRecord;
  assert.equal(getTrackingWindow(job.pickupAt).open, true, 'Fixture must otherwise permit a fresh live position');
  const payload = publicTrackPayload(job, null, { includeCustomerLocation: true });
  assert.equal(payload.driver, null); assert.equal(payload.customer, null);
  assert.equal(payload.sharingActive, false); assert.equal(payload.customerSharingActive, false);
  assert.equal(payload.trackUrl, "");
  const oldLink = `https://www.myairporttaxini.co.uk/track/?id=${token}`;
  assert.equal(buildPublicTrackUrl(token), ""); assert.equal(resolveEmailTrackUrl(job), undefined);
  assert.equal(customerTrackingText(oldLink), ""); assert.equal(customerTrackingHtml(oldLink), "");
  for (const buildEmail of [buildDriverOnTheWayEmail, buildDriverArrivedPickupEmail]) {
    const email = buildEmail({ customerName: "Fictional customer", bookedPickupTime: "10:30", trackUrl: oldLink });
    assert.doesNotMatch(email.html + email.text, /\/track\/|Track Your Driver|starts sharing their location/i);
    assert.match(email.text, /WhatsApp/);
  }
  const records = new Map<string, string>([[`track:job:${token}`, JSON.stringify({ ...job, sharingActive: false, customerSharingActive: false })]]);
  const store = {
    async get(key: string, type?: string) { const value = records.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; },
    async put(key: string, value: string) { records.set(key, value); },
    async delete(key: string) { records.delete(key); },
    async list({ prefix = "" } = {}) { return { keys: [...records.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  } as unknown as KVNamespace;
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: "fictional-owner-only" };
  async function transition(action: string) {
    return handleJourneyTransitionRequest(new Request("https://fictional.invalid/driver/journey", {
      method: "POST", headers: { "X-Owner-Key": env.OWNER_ACCESS_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ token, action }),
    }), env, null);
  }
  for (const [action, status] of [["start_tracking", "tracking"], ["start_tracking", "tracking"], ["arrived_pickup", "arrived_pickup"], ["arrived_pickup", "arrived_pickup"], ["start_journey", "en_route"], ["arrived_destination", "arrived_destination"], ["complete_journey", "completed"]]) {
    const response = await transition(action); assert.equal(response.status, 200);
    const result = await response.json() as Record<string, unknown>;
    assert.equal(result.journeyStatus, status); assert.equal(result.sharingActive, false);
    assert.equal(result.trackUrl, ""); assert.equal(result.trackingSession, undefined);
    if (action === "start_tracking" || action === "arrived_pickup") assert.equal(typeof result.customerWhatsAppMessage, "string");
  }
  assert.equal((await transition("stop_tracking")).status, 410);
  assert.ok(![...records.keys()].some(key => key.includes("tracking-session")));
  console.log("PASS: GPS endpoints reject without data access; cached positions and links are hidden; no tracking emails; real journey handlers retain all status transitions and manual WhatsApp text without GPS sessions or external calls.");
} finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
