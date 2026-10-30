/** My bookings: email-code sign-in, rate limits, session, bookings list, rebook data. */
import assert from "node:assert/strict";
import {
  buildCustomerLoginCodeEmail,
  normalizeCustomerEmail,
  type CustomerBookingsResponse,
} from "../shared/customer-account";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  handleCustomerBookings,
  handleCustomerLoginRequest,
  handleCustomerLoginVerify,
  handleCustomerLogout,
} from "../workers/addresses/src/customer-account-handlers";
import { customerBookingStatus } from "../workers/addresses/src/customer-account-store";
import { backfillCustomerBookingIndex } from "../workers/addresses/src/customer-account-backfill";
import { savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    kv,
    async get(key: string, type?: string) {
      const v = kv.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
    async delete(key: string) {
      kv.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const keys = [...kv.keys()].filter((k) => !options?.prefix || k.startsWith(options.prefix)).map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  } as unknown as KVNamespace & { kv: Map<string, string> };
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

function booking(overrides: Partial<PaidBookingRecord>): PaidBookingRecord {
  return {
    paymentReference: "PAY-1",
    customerReference: "MAT-1001",
    checkoutId: "chk-1",
    amount: 55,
    currency: "GBP",
    amountPaidLabel: "£55.00",
    customerName: "Sarah Jones",
    customerEmail: "Sarah@Example.com",
    mobileNumber: "07700900123",
    tripLabel: "Glengormley → Belfast International",
    pickupLabel: "12 Main Street, Glengormley BT36",
    dropoffLabel: "Belfast International Airport (BFS)",
    pickupPlaceId: "place-home",
    dropoffPlaceId: "place-bfs",
    pickupLat: 54.68,
    pickupLng: -5.96,
    dropoffLat: 54.66,
    dropoffLng: -6.21,
    returnJourney: false,
    tripDate: "2026-11-20",
    tripTime: "05:30",
    passengers: 2,
    suitcases: 2,
    vehicle: "Standard",
    calendarEventIds: [],
    status: "confirmed",
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  } as PaidBookingRecord;
}

async function main() {
  assert.equal(normalizeCustomerEmail("  Sarah@Example.COM "), "sarah@example.com");
  assert.equal(normalizeCustomerEmail("not-an-email"), "");

  const email = buildCustomerLoginCodeEmail({ code: "123456", name: "Sarah Jones" });
  assert.match(email.subject, /123456/);
  assert.match(email.text, /Hi Sarah,/);
  assert.match(email.html, /123456/);

  const store = memoryStore();
  const env = { TRACKING_STORE: store };
  const now = new Date("2026-10-30T12:00:00Z");

  // Saving a paid booking indexes it under the customer's email (any case).
  await savePaidBookingRecord(store, booking({}));
  await savePaidBookingRecord(store, booking({
    paymentReference: "PAY-2",
    customerReference: "MAT-0990",
    checkoutId: "chk-2",
    tripDate: "2026-06-02",
    tripTime: "14:00",
    createdAt: "2026-05-20T10:00:00.000Z",
    mobileNumber: "07700900999",
  }));
  await savePaidBookingRecord(store, booking({
    paymentReference: "PAY-3",
    customerReference: "MAT-1002",
    checkoutId: "chk-3",
    tripDate: "2026-12-01",
    status: "cancelled",
    operationalStatus: "cancelled",
    createdAt: "2026-10-05T10:00:00.000Z",
  }));
  // Someone else's booking and an owner test booking never show up.
  await savePaidBookingRecord(store, booking({ paymentReference: "PAY-9", customerReference: "MAT-2000", checkoutId: "chk-9", customerEmail: "tom@example.com" }));
  await savePaidBookingRecord(store, booking({ paymentReference: "REFUND-TEST-1", customerReference: "MAT-2001", checkoutId: "chk-t", isRefundTest: true }));

  // Request a code — sent only for emails with bookings, same answer either way.
  const sent: { to: string; code: string; name: string }[] = [];
  const sendCode = async (to: string, code: string, name: string) => {
    sent.push({ to, code, name });
    return true;
  };
  let res = await handleCustomerLoginRequest(post("https://w/customer/login/request", { email: "SARAH@example.com" }), env, null, sendCode);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, "sarah@example.com");
  assert.equal(sent[0]!.name, "Sarah Jones");
  assert.match(sent[0]!.code, /^\d{6}$/);

  res = await handleCustomerLoginRequest(post("https://w/customer/login/request", { email: "nobody@example.com" }), env, null, sendCode);
  assert.equal(res.status, 200, "no enumeration: unknown email still gets 200");
  assert.equal(sent.length, 1, "no email sent for unknown address");

  res = await handleCustomerLoginRequest(post("https://w/customer/login/request", { email: "bad" }), env, null, sendCode);
  assert.equal(res.status, 400);

  // Wrong code is rejected; the right code signs in and is single-use.
  res = await handleCustomerLoginVerify(post("https://w/customer/login/verify", { email: "sarah@example.com", code: "000000" === sent[0]!.code ? "111111" : "000000" }), env, null);
  assert.equal(res.status, 400);
  res = await handleCustomerLoginVerify(post("https://w/customer/login/verify", { email: "Sarah@Example.com", code: sent[0]!.code }), env, null);
  assert.equal(res.status, 200);
  const verified = (await res.json()) as { token: string; profile: { name: string; mobile: string } };
  assert.match(verified.token, /^[a-f0-9]{64}$/);
  assert.equal(verified.profile.name, "Sarah Jones");
  assert.equal(verified.profile.mobile, "07700900123", "profile uses the most recent booking's mobile");
  res = await handleCustomerLoginVerify(post("https://w/customer/login/verify", { email: "sarah@example.com", code: sent[0]!.code }), env, null);
  assert.equal(res.status, 400, "code cannot be reused");

  // Bookings list: own bookings only, upcoming first, manage links, place data for rebook.
  res = await handleCustomerBookings(new Request("https://w/customer/bookings", { headers: { "X-Customer-Session": verified.token } }), env, null, now);
  assert.equal(res.status, 200);
  const list = (await res.json()) as CustomerBookingsResponse;
  assert.deepEqual(list.bookings.map((b) => b.reference), ["MAT-1001", "MAT-1002", "MAT-0990"]);
  assert.deepEqual(list.bookings.map((b) => b.status), ["upcoming", "cancelled", "completed"]);
  const first = list.bookings[0]!;
  assert.equal(first.pickupPlaceId, "place-home");
  assert.equal(first.dropoffLat, 54.66);
  assert.match(first.manageUrl ?? "", /^https:\/\/www\.myairporttaxini\.co\.uk\/manage-booking\/\?token=[a-f0-9]+$/);
  assert.ok(!JSON.stringify(list).includes("PAY-"), "payment references never leak");
  assert.ok(!JSON.stringify(list).includes("tom@example.com"));

  // No / bad session → 401. Logout ends the session.
  res = await handleCustomerBookings(new Request("https://w/customer/bookings"), env, null, now);
  assert.equal(res.status, 401);
  await handleCustomerLogout(post("https://w/customer/logout", {}, { "X-Customer-Session": verified.token }), env, null);
  res = await handleCustomerBookings(new Request("https://w/customer/bookings", { headers: { "X-Customer-Session": verified.token } }), env, null, now);
  assert.equal(res.status, 401);

  // Five wrong guesses burn the code.
  sent.length = 0;
  await handleCustomerLoginRequest(post("https://w/customer/login/request", { email: "sarah@example.com" }), env, null, sendCode);
  const realCode = sent[0]!.code;
  const wrong = realCode === "999999" ? "888888" : "999999";
  for (let i = 0; i < 5; i += 1) {
    await handleCustomerLoginVerify(post("https://w/customer/login/verify", { email: "sarah@example.com", code: wrong }), env, null);
  }
  res = await handleCustomerLoginVerify(post("https://w/customer/login/verify", { email: "sarah@example.com", code: realCode }), env, null);
  assert.equal(res.status, 400, "code is dead after too many wrong attempts");

  // At most 5 codes per email per hour.
  const rateStore = memoryStore();
  await savePaidBookingRecord(rateStore, booking({}));
  let lastStatus = 0;
  for (let i = 0; i < 6; i += 1) {
    const r = await handleCustomerLoginRequest(post("https://w/customer/login/request", { email: "sarah@example.com" }), { TRACKING_STORE: rateStore }, null, sendCode);
    lastStatus = r.status;
  }
  assert.equal(lastStatus, 429);

  // Status: a return booking stays upcoming until its return leg is done.
  assert.equal(customerBookingStatus(booking({ tripDate: "2026-10-01", returnJourney: true, returnDate: "2026-11-02", returnTime: "18:00" }), now), "upcoming");
  assert.equal(customerBookingStatus(booking({ tripDate: "2026-10-30", tripTime: "10:30" }), now), "upcoming", "within 3 hours of pickup");
  assert.equal(customerBookingStatus(booking({ tripDate: "2026-10-30", tripTime: "08:00" }), now), "completed");

  // Backfill indexes bookings saved before the index existed, and only runs once.
  const oldStore = memoryStore();
  oldStore.kv.set("booking:ref:OLD-1", JSON.stringify(booking({ paymentReference: "OLD-1", customerReference: "MAT-0500", createdAt: new Date(Date.now() - 30 * 86400000).toISOString() })));
  const first1 = await backfillCustomerBookingIndex(oldStore);
  assert.equal(first1.ran, true);
  assert.equal(first1.indexed, 1);
  assert.equal((await backfillCustomerBookingIndex(oldStore)).ran, false);
  sent.length = 0;
  await handleCustomerLoginRequest(post("https://w/customer/login/request", { email: "sarah@example.com" }), { TRACKING_STORE: oldStore }, null, sendCode);
  assert.equal(sent.length, 1, "old customer can sign in after backfill");

  console.log("check-customer-account: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
