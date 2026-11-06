/**
 * Bespoke bookings vs existing airport automations, and duplicate-safe calendar.
 *
 * 1. Return-offer emails and airport pickup reminders skip bespoke bookings that
 *    start or finish at Belfast International, Belfast City or Dublin Airport —
 *    identified by the explicit bookingType, never by address text — while the
 *    same ordinary airport bookings still qualify.
 * 2. Google Calendar: a crash or lost response after the event was created never
 *    leads to a second event (event id derived from the payment reference).
 *
 * Run: npx tsx scripts/check-bespoke-isolation.ts
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { paidBookingToReturnOfferSnapshot, planReturnOfferProcessing, isEligibleForReturnOffer } from "../shared/return-offer";
import { evaluateAirportPickupReminder } from "../shared/airport-pickup-reminder";
import { airportPickupReminderInput } from "../workers/addresses/src/airport-pickup-reminder-handlers";
import { savePaidBookingRecordFromConfirm } from "../workers/addresses/src/refund-handlers";
import { getPaidBookingRecord, listRecentPaidBookings } from "../workers/addresses/src/paid-booking-store";
import { createTrackingJobFromBooking } from "../workers/addresses/src/tracking-store";
import { buildBespokeBookingDetails } from "../workers/addresses/src/bespoke-payment";
import { bespokeCalendarEventId, logBespokeBookingCalendar } from "../workers/addresses/src/bespoke-calendar";
import { createBespokeQuoteRecord, bespokeQuoteFingerprint, validateBespokeQuoteRequest } from "../shared/bespoke-quote";
import { parseLondonLocalDateTime } from "../shared/uk-time";

const kv = new Map<string, string>();
const KV = {
  async get(key: string, type?: unknown) {
    const v = kv.get(key) ?? null;
    const json = type === "json" || (typeof type === "object" && (type as { type?: string })?.type === "json");
    return v !== null && json ? JSON.parse(v) : v;
  },
  async getWithMetadata(key: string, type?: unknown) {
    return { value: await KV.get(key, type), metadata: null };
  },
  async put(key: string, value: string) {
    kv.set(key, value);
  },
  async delete(key: string) {
    kv.delete(key);
  },
  async list(opts: { prefix?: string; limit?: number } = {}) {
    const keys = [...kv.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).sort().slice(0, opts.limit ?? 1000);
    return { keys: keys.map((name) => ({ name })), list_complete: true, cursor: "" };
  },
} as unknown as KVNamespace;
const env = { TRACKING_STORE: KV } as never;

function london(daysAhead: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + daysAhead * 86_400_000));
}

const AIRPORTS = [
  { code: "BFS", label: "Belfast International Airport, Airport Road, Crumlin BT29 4AB" },
  { code: "BHD", label: "George Best Belfast City Airport, Belfast BT3 9JH" },
  { code: "DUB", label: "Dublin Airport, Collinstown, Co. Dublin" },
] as const;
const LOCAL = "12 Main Street, Lisburn BT27 4AA";

async function bespokeRecordFor(pickup: string, destination: string, n: number) {
  const date = london(3 + n);
  const v = validateBespokeQuoteRequest({
    category: "business_class",
    serviceType: "executive_airport",
    customerName: "Bea Spoke",
    customerEmail: `bespoke${n}@example.com`,
    customerPhone: "07700 900111",
    pickupAddress: pickup,
    destinationAddress: destination,
    date,
    time: "14:00",
    passengers: 2,
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: "2026-10",
  });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return createBespokeQuoteRecord({ reference: `MATNI-BQ-261106-ABCDE${"FGHJKM"[n % 6]}`, request: v.value, fingerprint: await bespokeQuoteFingerprint(v.value) });
}

function ordinaryBooking(pickup: string, destination: string, n: number, airportCode: string, fromAirport: boolean): PaidBookingDetails {
  return {
    customerName: "Ordinary Customer",
    customerEmail: `ordinary${n}@example.com`,
    mobileNumber: "07700900222",
    tripLabel: "Airport transfer — Saloon",
    pickupLabel: pickup,
    dropoffLabel: destination,
    returnJourney: false,
    tripDate: london(3 + n),
    tripTime: "14:00",
    returnDate: "",
    returnTime: "",
    flightNumber: fromAirport ? "EZY123" : "",
    passengers: 2,
    suitcases: 1,
    vehicle: "Standard Saloon",
    isAirportTrip: true,
    airportCode,
    isFromAirport: fromAirport,
    // As the instant quote records it (needed for the standard collection directions).
    outboundAirportAccessOption: airportCode === "DUB" ? "free" : "express",
  };
}

async function savePaid(booking: PaidBookingDetails, paymentReference: string) {
  await savePaidBookingRecordFromConfirm({
    env,
    booking,
    checkoutId: `cs_test_${paymentReference}`,
    amount: 120,
    currency: "GBP",
    amountPaidLabel: "£120.00",
    paymentReference,
    calendarEventIds: [],
  });
  const saved = await getPaidBookingRecord(KV, paymentReference);
  assert.ok(saved, "paid record saved");
  return saved!;
}

async function main() {
  console.log("=== Explicit marker is stored on the paid record and the tracking job ===");
  let n = 0;
  const results: Array<{ who: string; airport: string; dir: string; offer: string; reminder: string }> = [];
  for (const airport of AIRPORTS) {
    for (const fromAirport of [true, false]) {
      n += 1;
      const pickup = fromAirport ? airport.label : LOCAL;
      const destination = fromAirport ? LOCAL : airport.label;

      // --- bespoke (as created by the Phase 3 booking step) ---
      const record = await bespokeRecordFor(pickup, destination, n);
      const bespokeDetails = buildBespokeBookingDetails(record);
      assert.equal(bespokeDetails.bookingType, "bespoke");
      assert.equal(bespokeDetails.isAirportTrip, false);
      const bRef = `pi_bespoke_${n}`;
      const bPaid = await savePaid(bespokeDetails, bRef);
      assert.equal(bPaid.bookingType, "bespoke", "paid record carries the explicit type");
      assert.equal(bPaid.bespokeQuoteReference, record.reference);
      const bJob = await createTrackingJobFromBooking(KV, bespokeDetails, bRef);
      assert.equal(bJob?.bookingType, "bespoke", "tracking job carries the explicit type");

      // --- ordinary airport booking, same route ---
      const oRef = `pi_ordinary_${n}`;
      const ordinary = ordinaryBooking(pickup, destination, n, airport.code, fromAirport);
      const oPaid = await savePaid(ordinary, oRef);
      assert.equal(oPaid.bookingType, undefined, "ordinary records are unchanged");
      const oJob = await createTrackingJobFromBooking(KV, ordinary, oRef);
      assert.equal(oJob?.bookingType, undefined);

      // Return offer (one-way journeys): identical route, different type.
      const bOffer = isEligibleForReturnOffer(paidBookingToReturnOfferSnapshot(bPaid));
      const oOffer = isEligibleForReturnOffer(paidBookingToReturnOfferSnapshot(oPaid));
      assert.equal(bOffer.eligible, false);
      assert.equal(bOffer.reason, "bespoke_quotation", `${airport.code} bespoke must not get a return offer`);
      assert.equal(oOffer.eligible, true, `${airport.code} ordinary ${fromAirport ? "from" : "to"} airport still gets its return offer (${oOffer.reason})`);
      // The scheduler's full plan agrees.
      assert.equal(planReturnOfferProcessing({ booking: paidBookingToReturnOfferSnapshot(bPaid), correspondingReturnBooked: false }).status, "NOT_ELIGIBLE");

      // Airport pickup reminder — evaluated 30 minutes before pickup.
      const pickupAt = parseLondonLocalDateTime(bPaid.tripDate!, bPaid.tripTime!)!;
      const at = new Date(pickupAt.getTime() - 30 * 60_000);
      const bRem = evaluateAirportPickupReminder(airportPickupReminderInput(bJob!, bPaid), at);
      const bRemJobOnly = evaluateAirportPickupReminder(airportPickupReminderInput(bJob!, null), at);
      const oRem = evaluateAirportPickupReminder(airportPickupReminderInput(oJob!, oPaid), at);
      assert.equal(bRem.eligible, false);
      assert.equal(bRem.reason, "bespoke_quotation", `${airport.code} bespoke must not get airport pickup instructions`);
      assert.equal(bRemJobOnly.eligible, false, "skipped even if the paid record cannot be read (tracking-job marker)");
      if (fromAirport) {
        assert.equal(oRem.eligible, true, `${airport.code} ordinary airport pickup still gets its reminder (${oRem.eligible ? "" : oRem.reason})`);
      } else {
        assert.equal(oRem.eligible, false, "drop-offs never get a pickup reminder");
      }
      results.push({
        who: "bespoke",
        airport: airport.code,
        dir: fromAirport ? "from" : "to",
        offer: bOffer.reason,
        reminder: bRem.eligible ? "SEND" : bRem.reason,
      });
      results.push({
        who: "ordinary",
        airport: airport.code,
        dir: fromAirport ? "from" : "to",
        offer: oOffer.eligible ? "ELIGIBLE" : oOffer.reason,
        reminder: oRem.eligible ? "SEND" : oRem.reason,
      });
    }
  }
  console.table(results);

  console.log("=== Marker survives the cron's own read path ===");
  const recent = await listRecentPaidBookings(KV, { days: 90, limit: 200 });
  const snapshots = recent.map(paidBookingToReturnOfferSnapshot);
  const bespokeSnaps = snapshots.filter((s) => s.paymentReference.startsWith("pi_bespoke_"));
  assert.equal(bespokeSnaps.length, 6);
  assert.ok(bespokeSnaps.every((s) => s.bookingType === "bespoke" && !isEligibleForReturnOffer(s).eligible));
  assert.ok(snapshots.filter((s) => s.paymentReference.startsWith("pi_ordinary_")).every((s) => s.bookingType === undefined));
  // Not decided by text: an ordinary booking whose vehicle label says "Business Class" still qualifies.
  const lookalike = paidBookingToReturnOfferSnapshot({ ...(await getPaidBookingRecord(KV, "pi_ordinary_1"))!, vehicle: "Business Class (bespoke)", notes: "Bespoke-looking note" } as never);
  assert.equal(isEligibleForReturnOffer(lookalike).eligible, true, "labels and notes are ignored — only bookingType counts");

  // -------------------------------------------------------------------------
  console.log("=== Duplicate-safe Google Calendar ===");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const serviceAccount = JSON.stringify({
    client_email: "calendar@test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.googleapis.com/token",
  });
  const calEnv = { GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: serviceAccount, GOOGLE_CALENDAR_ID: "owner@example.com" };
  const events = new Map<string, Record<string, unknown>>();
  let inserts = 0;
  let mode: "ok" | "lost_after_create" | "network_error" | "server_error" = "ok";
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "ya29.test", expires_in: 3600 });
    const m = /\/calendars\/[^/]+\/events(?:\/([^/?]+))?/.exec(url);
    if (!m) return new Response("unexpected", { status: 599 });
    if (method === "GET" && m[1]) {
      const ev = events.get(decodeURIComponent(m[1]));
      return ev ? Response.json(ev) : new Response("not found", { status: 404 });
    }
    if (method === "POST" && !m[1]) {
      inserts += 1;
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const id = String(body.id ?? `google_${inserts}`);
      if (events.has(id)) return Response.json({ error: { code: 409, message: "The requested identifier already exists." } }, { status: 409 });
      if (mode === "network_error") {
        mode = "ok";
        throw new TypeError("network connection lost");
      }
      events.set(id, body); // Google stored it…
      if (mode === "lost_after_create") {
        mode = "ok";
        throw new TypeError("connection reset after the event was created"); // …but we never saw the answer.
      }
      if (mode === "server_error") {
        mode = "ok";
        return new Response("backend error", { status: 503 });
      }
      return Response.json({ ...body, id });
    }
    return new Response("unexpected", { status: 599 });
  }) as typeof fetch;

  const calRecord = await bespokeRecordFor(AIRPORTS[0].label, LOCAL, 50);
  const calBooking = { ...buildBespokeBookingDetails(calRecord), returnJourney: true, returnDate: london(60), returnTime: "20:00" };

  // Normal: two legs, our own ids.
  const first = await logBespokeBookingCalendar(calEnv, calBooking, "£120.00", "pi_cal_1");
  assert.equal(first.status, "logged");
  assert.equal(first.eventIds.length, 2);
  assert.equal(first.eventIds[0], await bespokeCalendarEventId("owner@example.com", "pi_cal_1", "outbound"));
  assert.ok(first.eventIds.every((id) => /^[a-v0-9]{5,1024}$/.test(id)), "valid Google event ids");
  assert.equal(events.size, 2);
  // Retry of the same booking (e.g. crash before the ids were saved): no new events.
  const again = await logBespokeBookingCalendar(calEnv, calBooking, "£120.00", "pi_cal_1");
  assert.equal(again.status, "logged");
  assert.deepEqual(again.eventIds, first.eventIds);
  assert.equal(again.status === "logged" && again.reused, 2);
  assert.equal(events.size, 2, "no duplicate after a retry");

  // Crash immediately after Google created the event (response lost).
  mode = "lost_after_create";
  const lost = await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£90.00", "pi_cal_2");
  assert.equal(lost.status, "uncertain", "uncertain point: stop, do not guess");
  assert.equal(events.size, 3, "Google did create it");
  const recovered = await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£90.00", "pi_cal_2");
  assert.equal(recovered.status, "logged");
  assert.equal(events.size, 3, "retry found the existing event — NO second event");
  assert.equal(recovered.status === "logged" && recovered.reused, 1);

  // Race: lookup says missing, insert answers 409 (created moments earlier) → reused, not duplicated.
  const raceId = await bespokeCalendarEventId("owner@example.com", "pi_cal_3", "outbound");
  const realFetch = globalThis.fetch;
  let hidOnce = false;
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!hidOnce && String(input).includes(`/events/${raceId}`)) {
      hidOnce = true;
      events.set(raceId, { id: raceId, summary: "created by a parallel attempt" });
      return new Response("not found", { status: 404 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const raced = await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£80.00", "pi_cal_3");
  assert.equal(raced.status, "logged");
  assert.equal([...events.keys()].filter((k) => k === raceId).length, 1, "409 treated as existing");
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;

  // Network error before Google stored anything, and a 5xx: uncertain, then safe retry.
  mode = "network_error";
  assert.equal((await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£70.00", "pi_cal_4")).status, "uncertain");
  const sizeBefore = events.size;
  assert.equal((await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£70.00", "pi_cal_4")).status, "logged");
  assert.equal(events.size, sizeBefore + 1, "exactly one event after the retry");
  mode = "server_error";
  assert.equal((await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£60.00", "pi_cal_5")).status, "uncertain");
  assert.equal((await logBespokeBookingCalendar(calEnv, { ...calBooking, returnJourney: false }, "£60.00", "pi_cal_5")).status, "logged");
  const pi5 = await bespokeCalendarEventId("owner@example.com", "pi_cal_5", "outbound");
  assert.equal([...events.keys()].filter((k) => k === pi5).length, 1);
  // Not configured → nothing attempted.
  assert.equal((await logBespokeBookingCalendar({}, calBooking, "£1", "pi_x")).status, "not_configured");

  console.log("=== Airport paths unchanged ===");
  const read = (f: string) => readFileSync(f, "utf8");
  assert.ok(!/bespoke/i.test(read("workers/addresses/src/google-calendar.ts")), "airport calendar code untouched");
  const indexSrc = read("workers/addresses/src/index.ts");
  const logFn = indexSrc.slice(indexSrc.indexOf("async function logPaidBookingCalendar("), indexSrc.indexOf("function parsePaidBookingDetails("));
  assert.ok(!/bespoke/i.test(logFn), "airport logPaidBookingCalendar unchanged");
  const returnOffer = read("shared/return-offer.ts");
  assert.equal((returnOffer.match(/bookingType === "bespoke"/g) ?? []).length, 2, "return-offer: one eligibility check + snapshot copy");
  const reminder = read("shared/airport-pickup-reminder.ts");
  assert.equal((reminder.match(/bookingType === "bespoke"/g) ?? []).length, 1);
  assert.ok(!/notes|vehicle/.test(returnOffer.slice(returnOffer.indexOf("export function isEligibleForReturnOffer"), returnOffer.indexOf("export function isEligibleForReturnOffer") + 600)), "decision never uses notes or vehicle text");

  console.log("\nAll bespoke isolation and calendar checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
