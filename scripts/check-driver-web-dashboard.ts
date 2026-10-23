/** Offline contract tests. No bookings, emails, provider calls or payments are sent. */
import assert from "node:assert/strict";
import { createTrackingJobFromBooking, saveTrackingJob, trackingRetentionSeconds } from "../workers/addresses/src/tracking-store";
import { createDriverPortalLink, exchangeDriverPortalLink } from "../workers/addresses/src/driver-portal-session";
import { handleDriverJobsRequest, handlePersonalDriverFlight } from "../workers/addresses/src/tracking-handlers";
import { handleDriverPortalInviteRequest } from "../workers/addresses/src/driver-portal-handlers";
import { fetchAllAssignedDriverJobs } from "../src/lib/tracking-api";
import { lookupFlight } from "../shared/flight-lookup";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import type { TrackingJobRecord } from "../shared/tracking";

async function main() {
  const data = new Map<string, string>();
  const ttl = new Map<string, number>();
  const store = {
    async get(key: string, type?: string) { const value = data.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; },
    async put(key: string, value: string, options?: { expirationTtl?: number }) { data.set(key, value); if (options?.expirationTtl) ttl.set(key, options.expirationTtl); },
    async delete(key: string) { data.delete(key); },
    async list({ prefix = "", limit = 25, cursor = "0" } = {}) { const keys = [...data.keys()].filter(key => key.startsWith(prefix)).sort(); const start = Number(cursor); return { keys: keys.slice(start, start + limit).map(name => ({ name })), list_complete: start + limit >= keys.length, cursor: String(start + limit) }; },
  } as unknown as KVNamespace;
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: "test-owner" };
  await store.put("owner:profile", JSON.stringify({ displayName: "Colin", email: "owner@example.invalid", mobile: "07000000000", make: "Mercedes", model: "Vito", colour: "Black", registration: "TEST" }));
  const date = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  const returnDate = new Date(Date.now() + 220 * 86400000).toISOString().slice(0, 10);
  const booking = { customerReference: "MATNI-TEST", customerName: "Fixture", customerEmail: "test@example.invalid", mobileNumber: "07000000001", pickupLabel: "Belfast", dropoffLabel: "Airport", tripDate: date, tripTime: "10:00", returnJourney: true, returnDate, returnTime: "11:00", isAirportTrip: true, isFromAirport: false, airportCode: "BFS", returnFlightNumber: "BA123" } as PaidBookingDetails;
  const outbound = await createTrackingJobFromBooking(store, booking, "test-payment");
  assert.ok(outbound?.pairedToken);
  const inbound = await store.get<TrackingJobRecord>(`track:job:${outbound.pairedToken}`, "json");
  for (const job of [outbound, inbound!]) {
    assert.equal(job.assignedDriverProfileKey, "owner"); assert.equal(job.assignmentStatus, "accepted"); assert.equal(job.customerReference, "MATNI-TEST");
    assert.ok(ttl.get(`track:job:${job.token}`)! > 200 * 86400);
  }
  assert.ok(ttl.get("track:ref:test-payment")! >= trackingRetentionSeconds(returnDate) - 2);
  await saveTrackingJob(store, { ...outbound, assignedDriverProfileKey: "other", assignedDriverName: "Other" });
  await createTrackingJobFromBooking(store, booking, "test-payment");
  assert.equal((await store.get<TrackingJobRecord>(`track:job:${outbound.token}`, "json"))?.assignedDriverProfileKey, "other");
  const link = await createDriverPortalLink(store, { profileKey: "owner", driverName: "Colin" });
  const session = await exchangeDriverPortalLink(store, link); assert.ok(session);
  assert.equal(await exchangeDriverPortalLink(store, link), null);
  const headers = { "X-Driver-Session": session.sessionToken };
  const response = await handleDriverJobsRequest(new Request("https://test.invalid/driver/jobs?scope=assigned-page", { headers }), env, null);
  assert.equal(response.status, 200);
  const payload = await response.json() as { jobs: Array<Record<string, unknown>> };
  assert.equal(payload.jobs.length, 1); assert.equal(payload.jobs[0].token, inbound!.token); assert.equal(payload.jobs[0].bookingReference, "MATNI-TEST"); assert.equal(payload.jobs[0].journeyLeg, "return"); assert.equal("paymentReference" in payload.jobs[0], false);
  assert.equal((await handleDriverJobsRequest(new Request("https://test.invalid/driver/jobs?scope=assigned-page", { headers: { "X-Owner-Key": "test-owner" } }), env, null)).status, 403);
  assert.equal((await handleDriverPortalInviteRequest(new Request("https://test.invalid/driver/portal/invite", { method: "POST", headers, body: '{}' }), env, null)).status, 403);
  const invite = await handleDriverPortalInviteRequest(new Request("https://test.invalid/driver/portal/invite", { method: "POST", headers: { "X-Owner-Key": "test-owner" }, body: '{}' }), env, null); assert.equal(invite.status, 200);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
  const flight = await handlePersonalDriverFlight(new Request(`https://test.invalid/driver/flight?token=${inbound!.token}`, { headers }), env, null);
  assert.equal(flight.status, 200); assert.equal((await flight.json() as { flight: unknown }).flight, null);
  assert.equal((await handlePersonalDriverFlight(new Request(`https://test.invalid/driver/flight?token=${outbound.token}`, { headers }), env, null)).status, 404);
  let pages = 0;
  globalThis.fetch = async () => new Response(JSON.stringify(++pages === 1 ? { role: "driver", jobs: [], nextCursor: "next" } : { role: "driver", jobs: [{ token: "future", pickupAt: returnDate }], nextCursor: null }), { status: 200 });
  const all = await fetchAllAssignedDriverJobs(session.sessionToken); assert.equal(pages, 2); assert.equal(all.jobs[0].token, "future");
  globalThis.fetch = async () => new Response(JSON.stringify([{ number: "BA123", status: "Delayed", departure: { airport: { iata: "LHR" } }, arrival: { airport: { iata: "BFS" }, scheduledTime: { local: `${date}T10:00:00+01:00` }, revisedTime: { local: `${date}T11:15:00+01:00` } } }]), { status: 200 });
  const delayed = await lookupFlight("fixture-key", { flightNumber: "BA123", tripDate: date, airportCode: "BFS", airportName: "Belfast", direction: "from-airport" });
  assert.ok(delayed.ok); if (delayed.ok) { assert.equal(delayed.flight.delayMinutes, 75); assert.equal(delayed.flight.status, "Delayed"); }
  globalThis.fetch = originalFetch;
  console.log("PASS future outbound/return assignment and retention; reassignment; scoped access; customer reference; invite authorization; flight no-call gate; empty pagination; flight delay mapping.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
