/**
 * Bespoke (manually priced) Event / Business Class quotes — Phase 1 backend.
 * Validation, state machine, payment safety rules, concurrency (Durable Object),
 * public/owner projections, HTTP handlers, and isolation guards.
 *
 * Run: npx tsx scripts/check-bespoke-quote.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyBespokeQuoteAction,
  bespokeQuoteFingerprint,
  createBespokeQuoteRecord,
  generateBespokeCustomerToken,
  generateBespokeQuoteReference,
  isBespokeQuoteReference,
  parseBespokeCustomerToken,
  sha256Hex,
  toBespokeQuoteOwnerView,
  toBespokeQuotePublicView,
  validateBespokeQuoteRequest,
  BESPOKE_QUOTE_MAX_PASSENGERS,
  type BespokeQuoteAction,
  type BespokeQuoteRecord,
  type ValidatedBespokeQuoteRequest,
} from "../shared/bespoke-quote";
import { verifyTurnstileToken } from "../shared/turnstile";
import { BespokeQuoteCoordinator } from "../workers/addresses/src/bespoke-quote-coordinator";
import {
  applyBespokeSystemAction,
  handleBespokeQuoteRoute,
  isBespokeQuotePath,
  type BespokeQuoteEnv,
} from "../workers/addresses/src/bespoke-quote-handlers";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const realNow = new Date();
function isoDate(daysAhead: number): string {
  const d = new Date(realNow.getTime() + daysAhead * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

function eventInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: "event",
    customerName: "Jane Doe",
    customerEmail: "jane.doe@example.com",
    customerPhone: "07700 900123",
    pickupAddress: "12 Main Street, Lisburn BT27 4AA",
    destinationAddress: "The O2 Belfast, Belfast BT3 9QQ",
    date: isoDate(30),
    time: "18:00",
    returnJourney: true,
    returnDate: isoDate(30),
    returnTime: "23:30",
    passengers: 6,
    groupVehicleRequested: true,
    additionalStops: ["Hillsborough village"],
    eventTitle: "Example Concert",
    eventDate: isoDate(30),
    eventVenue: "The O2 Belfast",
    eventId: "example-concert-belfast-2026",
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: "2026-10",
    ...overrides,
  };
}

function businessInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: "business_class",
    serviceType: "corporate",
    customerName: "Alex Smith",
    customerEmail: "alex.smith@example.com",
    customerPhone: "+44 7700 900456",
    pickupAddress: "Belfast International Airport, BT29 4AB",
    destinationAddress: "Titanic Belfast, BT3 9EP",
    date: isoDate(14),
    time: "09:30",
    passengers: 3,
    flightNumber: "ezy 1234",
    luggage: "2 cabin bags",
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: "2026-10",
    ...overrides,
  };
}

function validOrThrow(input: Record<string, unknown>, now = realNow): ValidatedBespokeQuoteRequest {
  const result = validateBespokeQuoteRequest(input, now);
  if (!result.ok) throw new Error(`Expected valid input: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function errorsOf(input: Record<string, unknown>, now = realNow): Record<string, string> {
  const result = validateBespokeQuoteRequest(input, now);
  assert.equal(result.ok, false, "expected validation failure");
  return result.ok ? {} : result.errors;
}

async function newRecord(input = eventInput(), now = realNow): Promise<BespokeQuoteRecord> {
  const request = validOrThrow(input, now);
  return createBespokeQuoteRecord({
    reference: generateBespokeQuoteReference(now),
    request,
    fingerprint: await bespokeQuoteFingerprint(request),
    now,
  });
}

function step(record: BespokeQuoteRecord, action: BespokeQuoteAction, now: Date): BespokeQuoteRecord {
  const result = applyBespokeQuoteAction(record, action, now);
  if (!result.ok) throw new Error(`${action.type} failed: ${result.error}`);
  return result.record;
}

function expectFail(record: BespokeQuoteRecord, action: BespokeQuoteAction, now: Date, code: string): void {
  const result = applyBespokeQuoteAction(record, action, now);
  assert.equal(result.ok, false, `${action.type} should fail`);
  if (!result.ok) assert.equal(result.code, code, `${action.type}: ${result.error}`);
}

const HASH_A = "a".repeat(64);

async function quoted(now = realNow, amountGbp = 120, validityHours = 48): Promise<BespokeQuoteRecord> {
  let r = await newRecord(eventInput(), now);
  r = step(r, { type: "owner_start_review" }, now);
  r = step(r, { type: "owner_update_availability", availability: "available", driverName: "Driver One" }, now);
  r = step(r, { type: "owner_set_costs", estimatedDriverCostGbp: 60, estimatedOtherCostsGbp: 10.5 }, now);
  return step(r, { type: "owner_issue_quote", amountGbp, validityHours, customerMessage: "Thanks!", tokenHash: HASH_A }, now);
}

function paying(r: BespokeQuoteRecord, now: Date, checkoutId = "cs_test_123"): BespokeQuoteRecord {
  r = step(r, { type: "system_begin_payment", quoteVersion: r.quote!.version, attemptId: "attempt-0001", tokenHash: HASH_A }, now);
  return step(r, { type: "system_attach_checkout", attemptId: "attempt-0001", checkoutId }, now);
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  console.log("=== Validation: Event Transfer ===");
  const ev = validOrThrow(eventInput());
  assert.equal(ev.category, "event");
  assert.equal(ev.customer.email, "jane.doe@example.com");
  assert.equal(ev.journey.groupVehicleRequested, true);
  assert.deepEqual(ev.journey.additionalStops, ["Hillsborough village"]);
  assert.equal(ev.event?.eventId, "example-concert-belfast-2026");
  assert.ok(errorsOf(eventInput({ passengers: BESPOKE_QUOTE_MAX_PASSENGERS.event + 1 })).passengers);
  assert.ok(errorsOf(eventInput({ passengers: 0 })).passengers);
  assert.ok(errorsOf(eventInput({ passengers: 2.5 })).passengers);
  assert.ok(errorsOf(eventInput({ eventTitle: "" })).eventTitle);
  assert.ok(errorsOf(eventInput({ eventVenue: "" })).eventVenue);
  assert.ok(errorsOf(eventInput({ eventId: "Bad ID!" })).eventId);
  assert.ok(errorsOf(eventInput({ eventDate: isoDate(-2) })).eventDate);
  assert.ok(errorsOf(eventInput({ additionalStops: ["a", "b", "c", "d"] })).additionalStops);
  assert.ok(errorsOf(eventInput({ returnTime: "17:00" })).returnTime, "return before outbound");
  assert.ok(errorsOf(eventInput({ returnDate: "" })).returnDate);

  console.log("=== Validation: Business Class (max 3 passengers, server-side) ===");
  const bc = validOrThrow(businessInput());
  assert.equal(bc.serviceType, "corporate");
  assert.equal(bc.journey.flightNumber, "EZY1234");
  assert.equal(bc.journey.groupVehicleRequested, false, "group flag is event-only");
  assert.equal(BESPOKE_QUOTE_MAX_PASSENGERS.business_class, 3);
  assert.match(errorsOf(businessInput({ passengers: 4 })).passengers, /up to 3/);
  assert.match(errorsOf(businessInput({ passengers: "4" })).passengers, /up to 3/);
  assert.ok(errorsOf(businessInput({ serviceType: "limousine" })).serviceType);
  assert.ok(errorsOf(businessInput({ flightNumber: "not a flight" })).flightNumber);
  assert.equal(validOrThrow(businessInput({ groupVehicleRequested: true })).journey.groupVehicleRequested, false);

  console.log("=== Validation: shared rules ===");
  assert.ok(errorsOf(eventInput({ category: "airport" })).category);
  assert.ok(errorsOf(eventInput({ customerEmail: "jane@gmail.con" })).customerEmail, "email typo caught");
  assert.ok(errorsOf(eventInput({ customerEmail: "nope" })).customerEmail);
  assert.ok(errorsOf(eventInput({ customerPhone: "12345" })).customerPhone);
  assert.ok(errorsOf(eventInput({ customerPhone: "<script>" })).customerPhone);
  assert.ok(errorsOf(eventInput({ termsAccepted: false })).termsAccepted);
  assert.ok(errorsOf(eventInput({ privacyAcknowledged: false })).privacyAcknowledged);
  assert.ok(errorsOf(eventInput({ termsVersion: "" })).termsVersion);
  assert.ok(errorsOf(eventInput({ date: isoDate(-1) })).date);
  assert.ok(errorsOf(eventInput({ date: isoDate(600) })).date, "too far ahead");
  assert.ok(errorsOf(eventInput({ date: "2026-02-30" })).date, "impossible date");
  assert.ok(errorsOf(eventInput({ time: "25:00" })).time);
  assert.ok(errorsOf(eventInput({ specialRequirements: "x".repeat(1001) })).specialRequirements);
  assert.ok(errorsOf(eventInput({ customerName: "x".repeat(101) })).customerName);
  const cleaned = validOrThrow(eventInput({ customerName: "  Jane\u0000  \u0007Doe  ", specialRequirements: "Wheelchair\u0008 access" }));
  assert.equal(cleaned.customer.name, "Jane Doe");
  assert.equal(cleaned.journey.specialRequirements, "Wheelchair access");
  // Pickup earlier today is rejected (London time).
  const lateEvening = new Date(`${isoDate(0)}T22:00:00Z`);
  assert.ok(errorsOf(eventInput({ date: isoDate(0), time: "08:00", returnJourney: false }), lateEvening).time);

  // -------------------------------------------------------------------------
  console.log("=== References and tokens ===");
  const ref = generateBespokeQuoteReference();
  assert.ok(isBespokeQuoteReference(ref), ref);
  assert.ok(!isBespokeQuoteReference("MATNI-BQ-261106-ABCDE0"), "0 is not in the alphabet");
  const { token, tokenHash } = await generateBespokeCustomerToken(ref);
  const parsed = parseBespokeCustomerToken(token);
  assert.equal(parsed?.reference, ref);
  assert.equal(await sha256Hex(parsed!.secret), tokenHash);
  assert.ok(!token.includes(tokenHash), "token never contains its stored hash");
  assert.equal(parseBespokeCustomerToken(`${ref}.${"g".repeat(64)}`), null);
  assert.equal(parseBespokeCustomerToken(`${ref}.abc`), null);
  assert.equal(parseBespokeCustomerToken(undefined), null);
  const fpA = await bespokeQuoteFingerprint(ev);
  const fpB = await bespokeQuoteFingerprint(validOrThrow(eventInput({ customerEmail: "JANE.DOE@example.com" })));
  assert.equal(fpA, fpB, "fingerprint ignores email case");
  assert.notEqual(fpA, await bespokeQuoteFingerprint(validOrThrow(eventInput({ date: isoDate(31), returnDate: isoDate(31), eventDate: isoDate(31) }))));

  // -------------------------------------------------------------------------
  console.log("=== State machine: happy path ===");
  const t0 = realNow;
  let r = await quoted(t0);
  assert.equal(r.status, "QUOTED");
  assert.equal(r.quote?.version, 1);
  assert.equal(r.quoteHistory.length, 1);
  const versionBefore = r.version;
  const begin1 = applyBespokeQuoteAction(r, { type: "system_begin_payment", quoteVersion: 1, attemptId: "attempt-0001", tokenHash: HASH_A }, t0);
  assert.ok(begin1.ok && begin1.changed && begin1.outcome === "new_attempt");
  r = begin1.ok ? begin1.record : r;
  assert.equal(r.status, "PAYMENT_STARTED");
  assert.equal(r.version, versionBefore + 1);
  // Second begin (double click / second tab) returns the SAME attempt: one checkout only.
  const begin2 = applyBespokeQuoteAction(r, { type: "system_begin_payment", quoteVersion: 1, attemptId: "attempt-0002", tokenHash: HASH_A }, t0);
  assert.ok(begin2.ok && !begin2.changed && begin2.outcome === "existing_attempt");
  assert.equal(r.paymentAttempt?.attemptId, "attempt-0001");
  r = step(r, { type: "system_attach_checkout", attemptId: "attempt-0001", checkoutId: "cs_test_123" }, t0);
  expectFail(r, { type: "system_attach_checkout", attemptId: "attempt-0001", checkoutId: "cs_other" }, t0, "checkout_conflict");
  // Owner cannot re-price while the customer is at checkout.
  expectFail(r, { type: "owner_issue_quote", amountGbp: 99, validityHours: 24, tokenHash: HASH_A }, t0, "invalid_status");
  r = step(r, { type: "system_record_payment", paymentReference: "pay_1", checkoutId: "cs_test_123", amountGbp: 120 }, t0);
  assert.equal(r.status, "PAID");
  assert.equal(r.payments.length, 1);
  assert.equal(r.payments[0].outcome, "accepted");
  // Same callback again (webhook + browser confirm): no-op.
  const dup = applyBespokeQuoteAction(r, { type: "system_record_payment", paymentReference: "pay_1", checkoutId: "cs_test_123", amountGbp: 120 }, t0);
  assert.ok(dup.ok && !dup.changed && dup.outcome === "duplicate_callback");
  r = step(r, { type: "system_mark_booked", bookingReference: "MATNI-1234" }, t0);
  assert.equal(r.status, "CONFIRMED");
  const rebook = applyBespokeQuoteAction(r, { type: "system_mark_booked", bookingReference: "MATNI-1234" }, t0);
  assert.ok(rebook.ok && !rebook.changed);
  expectFail(r, { type: "owner_cancel" }, t0, "invalid_status");

  console.log("=== Payment safety: second distinct payment keeps CONFIRMED and opens review ===");
  r = step(r, { type: "system_record_payment", paymentReference: "pay_2", checkoutId: "cs_test_123", amountGbp: 120 }, t0);
  assert.equal(r.status, "CONFIRMED", "never un-confirm a confirmed job");
  assert.equal(r.payments.length, 2, "every payment is recorded");
  assert.equal(r.review?.open, true);
  assert.ok(r.review?.reasons.includes("duplicate_payment"));
  r = step(r, { type: "owner_resolve_review", resolution: "manual_refund_required", note: "Refund the duplicate" }, t0);
  assert.equal(r.status, "CONFIRMED");
  r = step(r, { type: "owner_record_manual_refund", paymentReference: "pay_2", note: "Refunded in Stripe re_123" }, t0);
  assert.ok(r.payments[1].refundedManuallyAt);
  assert.equal(r.status, "CONFIRMED");

  console.log("=== Payment safety: paid after expiry is recorded and flagged, never auto-confirmed ===");
  let e = paying(await quoted(t0, 150, 1), t0);
  const afterExpiry = new Date(t0.getTime() + 2 * 3_600_000);
  e = step(e, { type: "system_record_payment", paymentReference: "pay_late", checkoutId: "cs_test_123", amountGbp: 150 }, afterExpiry);
  assert.equal(e.status, "PAYMENT_REVIEW");
  assert.ok(e.review?.reasons.includes("paid_after_expiry"));
  assert.equal(e.payments[0].outcome, "review");
  expectFail(e, { type: "system_mark_booked", bookingReference: "MATNI-1" }, afterExpiry, "invalid_status");
  expectFail(e, { type: "owner_cancel" }, afterExpiry, "invalid_status");
  expectFail(e, { type: "owner_resolve_review", resolution: "accept_payment", note: "" }, afterExpiry, "invalid_input");
  const accepted = step(e, { type: "owner_resolve_review", resolution: "accept_payment", note: "Vehicle still free" }, afterExpiry);
  assert.equal(accepted.status, "PAID");
  assert.equal(accepted.payments[0].outcome, "accepted");
  const refund = step(e, { type: "owner_resolve_review", resolution: "manual_refund_required", note: "No vehicle" }, afterExpiry);
  assert.equal(refund.status, "REFUND_REQUIRED");
  const refunded = step(refund, { type: "owner_record_manual_refund", paymentReference: "pay_late", note: "Refunded re_9" }, afterExpiry);
  assert.equal(refunded.status, "CANCELLED");

  console.log("=== Payment safety: cancelled while at checkout, then paid ===");
  let c = paying(await quoted(t0), t0);
  c = step(c, { type: "owner_cancel", note: "Driver unavailable" }, t0);
  assert.equal(c.status, "CANCELLED");
  c = step(c, { type: "system_record_payment", paymentReference: "pay_c", checkoutId: "cs_test_123", amountGbp: 120 }, t0);
  assert.equal(c.status, "PAYMENT_REVIEW");
  assert.ok(c.review?.reasons.includes("paid_after_cancellation"));

  console.log("=== Payment safety: vehicle lost, wrong amount, unknown checkout ===");
  let v = paying(await quoted(t0), t0);
  v = step(v, { type: "owner_update_availability", availability: "unavailable", availabilityNote: "Breakdown" }, t0);
  v = step(v, { type: "system_record_payment", paymentReference: "pay_v", checkoutId: "cs_test_123", amountGbp: 120 }, t0);
  assert.equal(v.status, "PAYMENT_REVIEW");
  assert.ok(v.review?.reasons.includes("vehicle_unavailable"));
  let m = paying(await quoted(t0), t0);
  m = step(m, { type: "system_record_payment", paymentReference: "pay_m", checkoutId: "cs_test_123", amountGbp: 12 }, t0);
  assert.ok(m.review?.reasons.includes("amount_mismatch"));
  let u = paying(await quoted(t0), t0);
  u = step(u, { type: "system_record_payment", paymentReference: "pay_u", checkoutId: "cs_unknown", amountGbp: 120 }, t0);
  assert.ok(u.review?.reasons.includes("unexpected_checkout"));
  let q = await quoted(t0);
  q = step(q, { type: "system_record_payment", paymentReference: "pay_q", amountGbp: 120 }, t0);
  assert.equal(q.status, "PAYMENT_REVIEW", "payment with no checkout attempt is never accepted");

  console.log("=== Expiry and attempts ===");
  let x = await quoted(t0, 100, 1);
  const before = applyBespokeQuoteAction(x, { type: "system_expire" }, t0);
  assert.ok(before.ok && !before.changed);
  x = step(x, { type: "system_expire" }, afterExpiry);
  assert.equal(x.status, "EXPIRED");
  expectFail(x, { type: "system_begin_payment", quoteVersion: 1, attemptId: "attempt-0009", tokenHash: HASH_A }, afterExpiry, "invalid_status");
  // Owner can re-issue after expiry → version 2, old version link is stale.
  x = step(x, { type: "owner_issue_quote", amountGbp: 110, validityHours: 24, tokenHash: "b".repeat(64) }, afterExpiry);
  assert.equal(x.quote?.version, 2);
  expectFail(x, { type: "system_begin_payment", quoteVersion: 2, attemptId: "attempt-0009", tokenHash: HASH_A }, afterExpiry, "not_found");
  expectFail(x, { type: "system_begin_payment", quoteVersion: 1, attemptId: "attempt-0009", tokenHash: "b".repeat(64) }, afterExpiry, "stale_quote");
  // Abandoned checkout: expiry cannot decide whether it was paid.
  const abandoned = paying(await quoted(t0, 100, 1), t0);
  const late = new Date(t0.getTime() + 3 * 3_600_000);
  const check = applyBespokeQuoteAction(abandoned, { type: "system_expire" }, late);
  assert.ok(check.ok && !check.changed && check.outcome === "needs_provider_check");
  expectFail(abandoned, { type: "system_begin_payment", quoteVersion: 1, attemptId: "attempt-0003", tokenHash: HASH_A }, late, "payment_in_progress");
  const released = step(abandoned, { type: "system_release_payment_attempt", attemptId: "attempt-0001", reason: "provider: not paid" }, late);
  assert.equal(released.status, "EXPIRED");
  assert.equal(released.paymentAttempt, undefined);

  console.log("=== Quote rules ===");
  const base = step(await newRecord(), { type: "owner_start_review" }, t0);
  expectFail(base, { type: "owner_issue_quote", amountGbp: 0.5, validityHours: 24, tokenHash: HASH_A }, t0, "invalid_input");
  expectFail(base, { type: "owner_issue_quote", amountGbp: 10.001, validityHours: 24, tokenHash: HASH_A }, t0, "invalid_input");
  expectFail(base, { type: "owner_issue_quote", amountGbp: 100, validityHours: 0, tokenHash: HASH_A }, t0, "invalid_input");
  expectFail(base, { type: "owner_issue_quote", amountGbp: 100, validityHours: 24 * 15, tokenHash: HASH_A }, t0, "invalid_input");
  expectFail(base, { type: "owner_issue_quote", amountGbp: 100, validityHours: 24, tokenHash: "short" }, t0, "invalid_input");
  const unavailable = step(base, { type: "owner_update_availability", availability: "unavailable" }, t0);
  expectFail(unavailable, { type: "owner_issue_quote", amountGbp: 100, validityHours: 24, tokenHash: HASH_A }, t0, "unavailable");
  expectFail(base, { type: "owner_set_costs", estimatedDriverCostGbp: -5 }, t0, "invalid_input");
  // Quote can never be payable after pickup: expiry is capped at the pickup time.
  const soon = await newRecord(businessInput({ date: isoDate(1), time: "09:00" }), t0);
  const soonQuoted = step(soon, { type: "owner_issue_quote", amountGbp: 200, validityHours: 24 * 14, tokenHash: HASH_A }, t0);
  const pickupMs = Date.parse(soonQuoted.quote!.expiresAt);
  assert.ok(pickupMs <= t0.getTime() + 2 * 86_400_000, "expiry capped at pickup");
  const afterPickup = new Date(pickupMs + 60_000);
  expectFail(soon, { type: "owner_issue_quote", amountGbp: 200, validityHours: 24, tokenHash: HASH_A }, afterPickup, "pickup_passed");
  // Customer decline needs the right token.
  const dq = await quoted(t0);
  expectFail(dq, { type: "customer_decline", tokenHash: "c".repeat(64) }, t0, "not_found");
  assert.equal(step(dq, { type: "customer_decline", tokenHash: HASH_A }, t0).status, "CUSTOMER_DECLINED");
  // Input record is never mutated.
  const frozen = await quoted(t0);
  const snapshot = JSON.stringify(frozen);
  applyBespokeQuoteAction(frozen, { type: "owner_cancel" }, t0);
  assert.equal(JSON.stringify(frozen), snapshot);

  // -------------------------------------------------------------------------
  console.log("=== Projections: no private data in public view ===");
  const pv = await quoted(t0);
  pv.owner.internalNotes = "SECRET-NOTE";
  pv.owner.availabilityNote = "SECRET-AVAIL";
  const publicJson = JSON.stringify(toBespokeQuotePublicView(pv, t0));
  for (const forbidden of [
    "jane.doe@example.com",
    "07700",
    "SECRET-NOTE",
    "SECRET-AVAIL",
    "estimatedDriverCost",
    "estimatedOtherCosts",
    "Profit",
    "tokenHash",
    HASH_A,
    "payments",
    "Driver One",
    "dedupeFingerprint",
    pv.dedupeFingerprint,
  ]) {
    assert.ok(!publicJson.includes(forbidden), `public view leaks ${forbidden}`);
  }
  const view = toBespokeQuotePublicView(pv, t0);
  assert.equal(view.customerFirstName, "Jane");
  assert.equal(view.quote?.amountGbp, 120);
  assert.equal(view.quote?.payable, true);
  assert.equal(toBespokeQuotePublicView(await newRecord(), t0).quote, undefined, "no quote block before quoting");
  const ownerView = toBespokeQuoteOwnerView(pv);
  assert.equal(ownerView.estimatedProfitGbp, 49.5);
  assert.ok(!JSON.stringify(ownerView).includes(HASH_A), "owner view drops token hash");

  // -------------------------------------------------------------------------
  console.log("=== Durable Object: atomic, idempotent under concurrency ===");
  const clock = { now: new Date(realNow) };
  class TestCoordinator extends BespokeQuoteCoordinator {
    protected override now(): Date {
      return new Date(clock.now);
    }
  }
  function fakeState(): DurableObjectState {
    const data = new Map<string, unknown>();
    let chain: Promise<unknown> = Promise.resolve();
    const storage = {
      async get<T>(key: string): Promise<T | undefined> {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3)); // force interleaving
        const v = data.get(key);
        return v === undefined ? undefined : (structuredClone(v) as T);
      },
      async put(key: string, value: unknown) {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
        data.set(key, structuredClone(value));
      },
      async delete(key: string) {
        return data.delete(key);
      },
      async deleteAll() {
        data.clear();
      },
      async setAlarm() {},
    };
    return {
      storage,
      blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
        const next = chain.then(fn);
        chain = next.catch(() => undefined);
        return next;
      },
    } as unknown as DurableObjectState;
  }
  const instances = new Map<string, TestCoordinator>();
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!instances.has(id)) instances.set(id, new TestCoordinator(fakeState()));
      const instance = instances.get(id)!;
      return { fetch: (url: string, init?: RequestInit) => instance.fetch(new Request(url, init)) };
    },
  } as unknown as DurableObjectNamespace;
  async function doCall(name: string, action: string, body: unknown): Promise<any> {
    const res = await namespace.get(namespace.idFromName(name)).fetch(`https://do/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res.json();
  }

  const doRecord = await quoted(realNow);
  const created = await Promise.all([1, 2, 3].map(() => doCall(`quote:${doRecord.reference}`, "create", { record: { ...doRecord, status: "NEW" } })));
  assert.equal(created.filter((c) => c.created).length, 1, "create is idempotent under concurrency");
  // Put the quoted record in place for the payment race.
  instances.delete(`quote:${doRecord.reference}`);
  const stubState = new TestCoordinator(fakeState());
  instances.set(`quote:${doRecord.reference}`, stubState);
  await (stubState as unknown as { ctx: DurableObjectState }).ctx.storage.put("record", doRecord);

  const begins = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      doCall(`quote:${doRecord.reference}`, "apply", {
        action: { type: "system_begin_payment", quoteVersion: 1, attemptId: `attempt-${String(i).padStart(4, "0")}`, tokenHash: HASH_A },
      }),
    ),
  );
  assert.equal(begins.filter((b) => b.outcome === "new_attempt").length, 1, "exactly one checkout attempt");
  assert.equal(begins.filter((b) => b.outcome === "existing_attempt").length, 19);
  const attemptId = begins.find((b) => b.outcome === "new_attempt").record.paymentAttempt.attemptId;
  await doCall(`quote:${doRecord.reference}`, "apply", { action: { type: "system_attach_checkout", attemptId, checkoutId: "cs_race" } });

  // Owner cancel races with the payment callback (twice, webhook + browser): payment always recorded once.
  const race = await Promise.all([
    doCall(`quote:${doRecord.reference}`, "apply", { action: { type: "system_record_payment", paymentReference: "pay_race", checkoutId: "cs_race", amountGbp: 120 } }),
    doCall(`quote:${doRecord.reference}`, "apply", { action: { type: "owner_cancel", note: "race" } }),
    doCall(`quote:${doRecord.reference}`, "apply", { action: { type: "system_record_payment", paymentReference: "pay_race", checkoutId: "cs_race", amountGbp: 120 } }),
  ]);
  const final = (await doCall(`quote:${doRecord.reference}`, "get", {})).record as BespokeQuoteRecord;
  assert.equal(final.payments.length, 1, "payment recorded exactly once");
  assert.ok(["PAID", "PAYMENT_REVIEW"].includes(final.status), `status ${final.status}`);
  if (final.status === "PAYMENT_REVIEW") assert.ok(final.review?.reasons.includes("paid_after_cancellation"));
  if (final.status === "PAID") assert.equal(race[1].ok, false, "cancel refused once money received");

  console.log("=== Durable Object: optimistic version check + idempotency key ===");
  const ov = await quoted(realNow);
  const ovName = `quote:${ov.reference}`;
  await doCall(ovName, "create", { record: { ...ov, status: "NEW" } });
  await (instances.get(ovName) as unknown as { ctx: DurableObjectState }).ctx.storage.put("record", ov);
  const stale = await doCall(ovName, "apply", { action: { type: "owner_cancel" }, expectedVersion: ov.version - 1 });
  assert.equal(stale.code, "version_conflict");
  const first = await doCall(ovName, "apply", {
    action: { type: "owner_set_costs", estimatedDriverCostGbp: 70 },
    expectedVersion: ov.version,
    idempotencyKey: "key-123456",
  });
  assert.equal(first.ok, true);
  const replay = await doCall(ovName, "apply", {
    action: { type: "owner_set_costs", estimatedDriverCostGbp: 70 },
    expectedVersion: ov.version,
    idempotencyKey: "key-123456",
  });
  assert.equal(replay.replayed, true, "double-click replays instead of failing or applying twice");
  assert.equal(replay.record.version, ov.version + 1);

  console.log("=== Durable Object: claim + rate limit ===");
  const claims = await Promise.all([1, 2, 3, 4].map((i) => doCall("dedupe:abc", "claim", { value: `v${i}`, ttlSeconds: 3600 })));
  assert.equal(claims.filter((c) => c.claimed).length, 1);
  assert.equal(new Set(claims.map((c) => c.value)).size, 1, "everyone sees the winner's value");
  const rates = await Promise.all(Array.from({ length: 8 }, () => doCall("rate:xyz", "rate", { limit: 5, windowSeconds: 3600 })));
  assert.equal(rates.filter((x) => x.allowed).length, 5);
  clock.now = new Date(realNow.getTime() + 3_601_000);
  assert.equal((await doCall("rate:xyz", "rate", { limit: 5, windowSeconds: 3600 })).allowed, true, "window resets");
  clock.now = new Date(realNow);
  assert.equal((await doCall(ovName, "rate", { limit: 5, windowSeconds: 60 })).error, "Wrong instance");

  // -------------------------------------------------------------------------
  console.log("=== Turnstile verification ===");
  const okFetch = (async () =>
    Response.json({ success: true, hostname: "www.myairporttaxini.co.uk", action: "bespoke_quote_request" })) as typeof fetch;
  const hosts = ["www.myairporttaxini.co.uk"];
  assert.deepEqual(await verifyTurnstileToken({ secret: "s", token: "t", expectedAction: "bespoke_quote_request", allowedHostnames: hosts, fetchImpl: okFetch }), { ok: true });
  assert.equal((await verifyTurnstileToken({ secret: "", token: "t", expectedAction: "bespoke_quote_request", allowedHostnames: hosts, fetchImpl: okFetch })).ok, false);
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "", expectedAction: "bespoke_quote_request", allowedHostnames: hosts, fetchImpl: okFetch })).ok, false);
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "t", expectedAction: "other", allowedHostnames: hosts, fetchImpl: okFetch })).ok, false);
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "t", expectedAction: "bespoke_quote_request", allowedHostnames: ["evil.example"], fetchImpl: okFetch })).ok, false);
  const failFetch = (async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] })) as typeof fetch;
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "t", expectedAction: "bespoke_quote_request", allowedHostnames: hosts, fetchImpl: failFetch })).ok, false);
  const downFetch = (async () => { throw new Error("network"); }) as typeof fetch;
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "t", expectedAction: "bespoke_quote_request", allowedHostnames: hosts, fetchImpl: downFetch })).ok, false, "fails closed");

  // -------------------------------------------------------------------------
  console.log("=== HTTP handlers ===");
  assert.ok(isBespokeQuotePath("/bespoke-quotes/request"));
  assert.ok(isBespokeQuotePath("/api/owner/bespoke-quotes/detail"));
  assert.ok(!isBespokeQuotePath("/a2a-quotes"));
  assert.ok(!isBespokeQuotePath("/bespoke-quotes/../owner"));

  const kv = new Map<string, { value: string; metadata?: unknown }>();
  const fakeKv = {
    async get(key: string) {
      return kv.get(key)?.value ?? null;
    },
    async put(key: string, value: string, opts?: { metadata?: unknown }) {
      kv.set(key, { value, metadata: opts?.metadata });
    },
    async list(opts: { prefix?: string; limit?: number }) {
      const keys = [...kv.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).sort().slice(0, opts.limit ?? 1000);
      return { keys: keys.map((name) => ({ name, metadata: kv.get(name)?.metadata })), list_complete: true };
    },
  } as unknown as KVNamespace;

  let turnstileOk = true;
  const deps = {
    fetchImpl: (async () =>
      Response.json(
        turnstileOk
          ? { success: true, hostname: "www.myairporttaxini.co.uk", action: "bespoke_quote_request" }
          : { success: false },
      )) as typeof fetch,
  };
  const env: BespokeQuoteEnv = {
    TRACKING_STORE: fakeKv,
    BESPOKE_QUOTE_COORDINATOR: namespace,
    BESPOKE_QUOTES_ENABLED: "1",
    TURNSTILE_SECRET_KEY: "test-secret",
    OWNER_ACCESS_KEY: "owner-key-123",
    DRIVER_ACCESS_KEY: "driver-key-456",
  };
  let ipCounter = 0;
  async function call(path: string, init: { method?: string; body?: unknown; owner?: string; ip?: string; envOverride?: Partial<BespokeQuoteEnv> } = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": init.ip ?? `198.51.100.${++ipCounter % 250}` };
    if (init.owner) headers["X-Owner-Key"] = init.owner;
    const request = new Request(`https://worker.example${path}`, {
      method: init.method ?? "POST",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const response = await handleBespokeQuoteRoute(request, { ...env, ...init.envOverride }, "https://www.myairporttaxini.co.uk", deps);
    const text = await response.text();
    return { status: response.status, text, json: text ? JSON.parse(text) : null, headers: response.headers };
  }

  // Disabled by default.
  assert.equal((await call("/bespoke-quotes/request", { body: eventInput(), envOverride: { BESPOKE_QUOTES_ENABLED: undefined } })).status, 404);
  assert.equal((await call("/bespoke-quotes/view", { body: {}, envOverride: { BESPOKE_QUOTES_ENABLED: "true" } })).status, 404, "only exactly '1' enables");
  // Fail closed without Turnstile secret or coordinator.
  assert.equal((await call("/bespoke-quotes/request", { body: eventInput(), envOverride: { TURNSTILE_SECRET_KEY: "" } })).status, 503);
  assert.equal((await call("/bespoke-quotes/request", { body: eventInput(), envOverride: { BESPOKE_QUOTE_COORDINATOR: undefined } })).status, 503);
  // Turnstile failure.
  turnstileOk = false;
  assert.equal((await call("/bespoke-quotes/request", { body: { ...eventInput(), turnstileToken: "x" } })).status, 403);
  turnstileOk = true;
  // Honeypot: looks like success, stores nothing.
  const kvBefore = kv.size;
  const pot = await call("/bespoke-quotes/request", { body: { ...eventInput(), website: "http://spam", turnstileToken: "x" } });
  assert.equal(pot.status, 200);
  assert.equal(pot.json.reference, undefined);
  assert.equal(kv.size, kvBefore);
  // Validation errors are returned per field.
  const bad = await call("/bespoke-quotes/request", { body: { ...businessInput({ passengers: 4 }), turnstileToken: "x" } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.errors.passengers, /up to 3/);
  // Oversized body.
  assert.equal((await call("/bespoke-quotes/request", { body: { ...eventInput(), turnstileToken: "x", pad: "x".repeat(20_000) } })).status, 400);

  // Success + duplicate.
  const ok1 = await call("/bespoke-quotes/request", { body: { ...eventInput(), turnstileToken: "x" } });
  assert.equal(ok1.status, 201, ok1.text);
  assert.ok(isBespokeQuoteReference(ok1.json.reference));
  assert.equal(ok1.json.duplicate, false);
  assert.ok(!ok1.text.includes("jane.doe@example.com"), "response never echoes contact details");
  assert.equal(ok1.headers.get("Cache-Control"), "no-store");
  const ok2 = await call("/bespoke-quotes/request", { body: { ...eventInput(), turnstileToken: "x" } });
  assert.equal(ok2.json.reference, ok1.json.reference, "duplicate submission returns the same reference");
  assert.equal(ok2.json.duplicate, true);
  const reference: string = ok1.json.reference;

  // Rate limit per IP (5/hour) — the 6th from one IP is refused.
  const ipResults = [];
  for (let i = 0; i < 6; i++) {
    ipResults.push((await call("/bespoke-quotes/request", { ip: "203.0.113.9", body: { ...businessInput({ customerEmail: `p${i}@example.com` }), turnstileToken: "x" } })).status);
  }
  assert.deepEqual(ipResults.slice(0, 5).every((s) => s === 201), true, JSON.stringify(ipResults));
  assert.equal(ipResults[5], 429);
  // Rate limit per email (3/day) across IPs.
  const emailResults = [];
  for (let i = 0; i < 4; i++) {
    emailResults.push((await call("/bespoke-quotes/request", { body: { ...businessInput({ customerEmail: "same@example.com", date: isoDate(20 + i) }), turnstileToken: "x" } })).status);
  }
  assert.equal(emailResults[3], 429, JSON.stringify(emailResults));

  // Owner routes.
  assert.equal((await call("/owner/bespoke-quotes", { method: "GET" })).status, 401);
  assert.equal((await call("/owner/bespoke-quotes", { method: "GET", owner: "wrong" })).status, 401);
  const list = await call("/owner/bespoke-quotes?category=event", { method: "GET", owner: "owner-key-123" });
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((i: { reference: string }) => i.reference === reference));
  assert.ok(list.json.items.every((i: { category: string }) => i.category === "event"));
  // Owner routes work even when the public flag is off.
  assert.equal((await call("/owner/bespoke-quotes", { method: "GET", owner: "owner-key-123", envOverride: { BESPOKE_QUOTES_ENABLED: undefined } })).status, 200);
  const detail = await call(`/owner/bespoke-quotes/detail?reference=${reference}`, { method: "GET", owner: "owner-key-123" });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.request.customer.email, "jane.doe@example.com", "owner sees contact details");
  let version: number = detail.json.request.version;

  const act = async (action: Record<string, unknown>, key: string, expected = version) =>
    call("/owner/bespoke-quotes/action", { owner: "owner-key-123", body: { reference, expectedVersion: expected, idempotencyKey: key, action } });
  let res = await act({ type: "owner_start_review" }, "k-start-0001");
  assert.equal(res.status, 200, res.text);
  version = res.json.request.version;
  res = await act({ type: "owner_set_costs", estimatedDriverCostGbp: "55", estimatedOtherCostsGbp: 5 }, "k-costs-0001");
  version = res.json.request.version;
  // Browser cannot inject its own token hash or system actions.
  assert.equal((await act({ type: "system_record_payment", paymentReference: "x", amountGbp: 1 }, "k-sys-00001")).status, 400);
  res = await act({ type: "owner_issue_quote", amountGbp: 140, validityHours: 48, customerMessage: "Hi Jane", tokenHash: "f".repeat(64) }, "k-quote-0001");
  assert.equal(res.status, 200, res.text);
  const customerToken: string = res.json.customerToken;
  assert.ok(parseBespokeCustomerToken(customerToken), "owner gets the customer token once");
  assert.ok(!res.text.includes("f".repeat(64)), "browser-supplied token hash ignored");
  assert.ok(!res.text.includes(await sha256Hex(parseBespokeCustomerToken(customerToken)!.secret)), "token hash never returned");
  assert.equal(res.json.request.estimatedProfitGbp, 80);
  version = res.json.request.version;
  // Replay of the same idempotency key does not mint a new token.
  const replayRes = await act({ type: "owner_issue_quote", amountGbp: 140, validityHours: 48 }, "k-quote-0001", version - 1);
  assert.equal(replayRes.json.replayed, true);
  assert.equal(replayRes.json.customerToken, undefined);
  // Stale version → 409.
  assert.equal((await act({ type: "owner_cancel" }, "k-cancel-001", version - 1)).status, 409);

  // Customer view by token.
  const viewRes = await call("/bespoke-quotes/view", { body: { token: customerToken } });
  assert.equal(viewRes.status, 200, viewRes.text);
  assert.equal(viewRes.json.quote.quote.amountGbp, 140);
  for (const forbidden of ["jane.doe@example.com", "07700", "estimated", "Profit", "tokenHash", "internalNotes", "payments"]) {
    assert.ok(!viewRes.text.includes(forbidden), `public view leaks ${forbidden}`);
  }
  const forged = customerToken.slice(0, -1) + (customerToken.endsWith("0") ? "1" : "0");
  assert.equal((await call("/bespoke-quotes/view", { body: { token: forged } })).status, 404);
  assert.equal((await call("/bespoke-quotes/view", { body: { token: "junk" } })).status, 404);
  assert.equal((await call("/bespoke-quotes/view", { method: "GET" })).status, 405);
  // View rate limit (30/hour per IP).
  let lastStatus = 0;
  for (let i = 0; i < 31; i++) lastStatus = (await call("/bespoke-quotes/view", { ip: "192.0.2.77", body: { token: forged } })).status;
  assert.equal(lastStatus, 429);
  // Decline.
  const declined = await call("/bespoke-quotes/decline", { body: { token: customerToken } });
  assert.equal(declined.status, 200, declined.text);
  assert.equal(declined.json.quote.status, "CUSTOMER_DECLINED");
  assert.equal((await call("/bespoke-quotes/decline", { body: { token: customerToken } })).status, 409);

  // System actions are internal-only.
  const sys = await applyBespokeSystemAction(env, reference, { type: "system_expire" });
  assert.equal(sys.ok, true);
  assert.equal((await applyBespokeSystemAction({ ...env, BESPOKE_QUOTE_COORDINATOR: undefined }, reference, { type: "system_expire" })).ok, false);

  // -------------------------------------------------------------------------
  console.log("=== Isolation guards ===");
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.ok(!/bespoke/i.test(finalize), "shared payment finalisation untouched in Phase 1");
  const paymentProvider = read("workers/addresses/src/payment-provider.ts");
  assert.ok(!/bespoke/i.test(paymentProvider), "payment provider untouched");
  for (const file of ["shared/executive-vehicle.ts", "shared/business-class-minimum.ts", "shared/business-class-capacity.ts", "workers/addresses/src/main-quote-pricing.ts", "src/components/QuoteCard.tsx"]) {
    assert.ok(!/bespoke/i.test(read(file)), `${file} must not reference bespoke quotes`);
  }
  const wrangler = read("workers/addresses/wrangler.toml");
  for (const tag of ["v1-refund-coordinator", "v2-quote-lead-coordinator", "v3-meet-greet-coordinator", "v4-consent-ledger", "v5-bespoke-quote-coordinator"]) {
    assert.ok(wrangler.includes(`tag = "${tag}"`), `migration ${tag} present`);
  }
  assert.ok(wrangler.indexOf("v4-consent-ledger") < wrangler.indexOf("v5-bespoke-quote-coordinator"), "v5 appended after v4");
  assert.match(wrangler, /new_sqlite_classes = \["BespokeQuoteCoordinator"\]/);
  assert.ok(!/^\s*BESPOKE_QUOTES_ENABLED\s*=/m.test(wrangler), "public flag is not switched on in config");
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /export \{ BespokeQuoteCoordinator \}/);
  assert.match(index, /isBespokeQuotePath\(url\.pathname\)/);

  console.log("\nAll bespoke quote checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
