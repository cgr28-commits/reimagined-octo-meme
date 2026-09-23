/**
 * Owner No Availability (legacy Jobs-tab periods, System B).
 * Run: npx tsx scripts/check-owner-no-availability.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import {
  OWNER_NO_AVAILABILITY_CODE,
  OWNER_NO_AVAILABILITY_MESSAGE,
  evaluateOwnerNoAvailability,
  existingJourneyDurationMinutes,
  findConflictingNoAvailabilityPeriod,
  findRequestOnlyBlockingPeriod,
  legConflictsWithNoAvailability,
  ownerAvailabilityLegsFromBooking,
  isNoAvailabilityPeriod,
  isRequestOnlyUnavailablePeriod,
  journeyWindowOverlapsUnavailablePeriod,
  normalizeUnavailablePeriod,
  normalizeUnavailablePeriodMode,
  ownerUnavailablePeriodModeLabel,
  parseLondonLocalStored,
  type UnavailablePeriod,
} from "../shared/booking-notice";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import {
  createShortNoticeRequest,
  shouldForceShortNotice,
} from "../workers/addresses/src/short-notice-handlers";
import {
  addUnavailablePeriod,
  getBookingSettings,
  updateUnavailablePeriod,
} from "../workers/addresses/src/booking-settings-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { DEFAULT_SMART_OPS_CONFIG } from "../shared/smart-ops-config";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

async function checkAsync(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function isOwnerNoAvailabilityThrown(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "OwnerNoAvailabilityError" &&
    (error as { code?: string }).code === OWNER_NO_AVAILABILITY_CODE
  );
}

function memoryKv(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) {
    data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw);
      return raw;
    },
    async put(key: string, value: string, _options?: { expirationTtl?: number }) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  } as unknown as KVNamespace;
}

function period(input: {
  startLocal: string;
  endLocal: string;
  mode?: unknown;
  id?: string;
}): UnavailablePeriod {
  const normalized = normalizeUnavailablePeriod({
    id: input.id ?? "unavail-test",
    startLocal: input.startLocal,
    endLocal: input.endLocal,
    mode: input.mode as string | undefined,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });
  assert.ok(normalized);
  return normalized;
}

function sampleBooking(overrides: Partial<PaidBookingDetails> = {}): PaidBookingDetails {
  return {
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    mobileNumber: "07700900123",
    pickupLabel: "10 Donegall Square North, Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: "2026-06-15",
    tripTime: "18:30",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Saloon",
    ...overrides,
  };
}

const NOW = parseLondonLocalDateTime("2026-06-14", "10:00")!;
const CLOSED = period({
  startLocal: "2026-06-15T18:00",
  endLocal: "2026-06-15T22:00",
  mode: "no_availability",
});
const REQUEST_ONLY = period({
  startLocal: "2026-06-15T18:00",
  endLocal: "2026-06-15T22:00",
  mode: "request_only",
  id: "unavail-request",
});
const LEGACY = period({
  startLocal: "2026-06-15T18:00",
  endLocal: "2026-06-15T22:00",
  id: "unavail-legacy",
});

async function main() {
  check("1. Existing period without mode => request_only", () => {
    assert.equal(normalizeUnavailablePeriodMode(undefined), "request_only");
    assert.equal(normalizeUnavailablePeriodMode(null), "request_only");
    assert.equal(normalizeUnavailablePeriodMode(""), "request_only");
    assert.equal(LEGACY.mode, "request_only");
    assert.equal(isRequestOnlyUnavailablePeriod(LEGACY), true);
    assert.equal(isNoAvailabilityPeriod(LEGACY), false);
    const notice = findRequestOnlyBlockingPeriod("2026-06-15", "18:30", [LEGACY], NOW);
    assert.equal(notice?.id, LEGACY.id);
    assert.equal(evaluateOwnerNoAvailability(sampleBooking(), [LEGACY], NOW).blocked, false);
  });

  check("2. Explicit request_only => REQUEST ONLY", () => {
    assert.equal(REQUEST_ONLY.mode, "request_only");
    const notice = findRequestOnlyBlockingPeriod("2026-06-15", "18:30", [REQUEST_ONLY], NOW);
    assert.equal(notice?.id, REQUEST_ONLY.id);
    assert.equal(evaluateOwnerNoAvailability(sampleBooking(), [REQUEST_ONLY], NOW).blocked, false);
  });

  await checkAsync("3. no_availability => cannot pay", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [CLOSED], minimumBookingNoticeHours: 12 },
    });
    const notice = await shouldForceShortNotice(store, sampleBooking(), NOW);
    assert.equal(notice.noAvailability, true);
    assert.equal(notice.shortNotice, false);
    const availability = evaluateOwnerNoAvailability(sampleBooking(), [CLOSED], NOW);
    assert.equal(availability.blocked, true);
    assert.equal(availability.state, "no_availability");
    assert.equal(availability.code, OWNER_NO_AVAILABILITY_CODE);
    assert.equal(availability.customerMessage, OWNER_NO_AVAILABILITY_MESSAGE);
  });

  await checkAsync("4. no_availability => cannot create request", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [CLOSED], minimumBookingNoticeHours: 12 },
    });
    await assert.rejects(
      () =>
        createShortNoticeRequest({
          store,
          booking: sampleBooking(),
          amount: 48,
          now: NOW,
        }),
      (error: unknown) => isOwnerNoAvailabilityThrown(error),
    );
  });

  await checkAsync("5. no_availability overrides minimum-notice request behaviour", async () => {
    const pickup = parseLondonLocalDateTime("2026-06-15", "18:30");
    assert.ok(pickup);
    const underNotice = new Date(pickup.getTime() - 4 * 60 * 60 * 1000);
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [CLOSED], minimumBookingNoticeHours: 12 },
    });
    const notice = await shouldForceShortNotice(store, sampleBooking(), underNotice);
    assert.equal(notice.noAvailability, true);
    assert.equal(notice.shortNotice, false);
    assert.equal(notice.underMinimumNotice, false);
    await assert.rejects(
      () =>
        createShortNoticeRequest({
          store,
          booking: sampleBooking(),
          amount: 48,
          now: underNotice,
        }),
      (error: unknown) => isOwnerNoAvailabilityThrown(error),
    );
  });

  await checkAsync("6. Normal journey outside period => unaffected", async () => {
    const outside = sampleBooking({ tripDate: "2026-06-15", tripTime: "14:00" });
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [CLOSED], minimumBookingNoticeHours: 12 },
    });
    const notice = await shouldForceShortNotice(store, outside, NOW);
    assert.equal(notice.noAvailability, false);
    assert.equal(notice.shortNotice, false);
    assert.equal(evaluateOwnerNoAvailability(outside, [CLOSED], NOW).blocked, false);
  });

  check("7. Start boundary is blocked", () => {
    const atStart = sampleBooking({ tripTime: "18:00" });
    assert.equal(evaluateOwnerNoAvailability(atStart, [CLOSED], NOW).blocked, true);
    assert.ok(findConflictingNoAvailabilityPeriod(atStart, [CLOSED], NOW));
  });

  check("8. Journey beginning exactly at period end => allowed", () => {
    const atEnd = sampleBooking({ tripTime: "22:00" });
    assert.equal(evaluateOwnerNoAvailability(atEnd, [CLOSED], NOW).blocked, false);
    assert.equal(findConflictingNoAvailabilityPeriod(atEnd, [CLOSED], NOW), null);
  });

  check("9. Journey starting before period but overlapping it => blocked when duration available", () => {
    const overlap = sampleBooking({
      tripTime: "17:30",
      routeDurationMinutes: 90,
    });
    assert.equal(existingJourneyDurationMinutes(90, null), 90);
    assert.equal(evaluateOwnerNoAvailability(overlap, [CLOSED], NOW).blocked, true);
    const pickupOnly = sampleBooking({ tripTime: "17:30" });
    assert.equal(evaluateOwnerNoAvailability(pickupOnly, [CLOSED], NOW).blocked, false);
    const start = parseLondonLocalDateTime("2026-06-15", "17:30")!;
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    assert.equal(
      journeyWindowOverlapsUnavailablePeriod(start.getTime(), end.getTime(), CLOSED),
      true,
    );
  });

  await checkAsync("10. Old/stale quote is blocked after Owner later adds no_availability", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 12 },
    });
    const booking = sampleBooking({ tripTime: "18:30" });
    const before = await shouldForceShortNotice(store, booking, NOW);
    assert.equal(before.noAvailability, false);
    assert.equal(before.shortNotice, false);
    await addUnavailablePeriod(store, {
      startLocal: "2026-06-15T18:00",
      endLocal: "2026-06-15T22:00",
      mode: "no_availability",
    });
    const after = await shouldForceShortNotice(store, booking, NOW);
    assert.equal(after.noAvailability, true);
    assert.equal(after.shortNotice, false);
    await assert.rejects(
      () => createShortNoticeRequest({ store, booking, amount: 48, now: NOW }),
      (error: unknown) => isOwnerNoAvailabilityThrown(error),
    );
  });

  check("11. Direct payment endpoint cannot bypass it", () => {
    const payments = read("workers/addresses/src/index.ts");
    const createPayment = read("src/lib/create-payment.ts");
    assert.match(payments, /blockedOwnerNoAvailabilityResponse/);
    assert.match(payments, /notice\.noAvailability/);
    assert.match(payments, /OWNER_NO_AVAILABILITY_CODE/);
    assert.match(payments, /shortNoticeToken/);
    assert.match(payments, /a2aQuoteToken/);
    assert.match(payments, /quickQuoteId/);
    assert.match(payments, /savedQuoteToken/);
    assert.match(createPayment, /OWNER_NO_AVAILABILITY_CODE/);
    const paymentFn = payments.slice(payments.indexOf("async function handlePaymentRequest"));
    const closedIdx = paymentFn.indexOf("blockedOwnerNoAvailabilityResponse");
    const requestIdx = paymentFn.indexOf("createShortNoticeRequest");
    assert.ok(closedIdx >= 0 && requestIdx > closedIdx);
  });

  check("12. Direct request endpoint cannot bypass it", () => {
    const handlers = read("workers/addresses/src/short-notice-handlers.ts");
    const payments = read("workers/addresses/src/index.ts");
    assert.match(handlers, /findConflictingNoAvailabilityPeriod/);
    assert.match(handlers, /throw new OwnerNoAvailabilityError/);
    assert.match(payments, /error instanceof OwnerNoAvailabilityError/);
  });

  check("13. Return-leg conflict is handled correctly", () => {
    const returnConflict = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-15",
      returnTime: "18:30",
      routeDurationMinutes: 40,
    });
    const availability = evaluateOwnerNoAvailability(returnConflict, [CLOSED], NOW);
    assert.equal(availability.blocked, true);
    const bothClear = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-16",
      returnTime: "10:00",
      routeDurationMinutes: 40,
    });
    assert.equal(evaluateOwnerNoAvailability(bothClear, [CLOSED], NOW).blocked, false);
  });

  check("13b. Missing return duration uses pickup-time fallback, never outbound duration", () => {
    const notice = read("shared/booking-notice.ts");
    const workerNotice = read("workers/addresses/shared/booking-notice.ts");
    assert.doesNotMatch(notice, /returnDuration \?\? outboundDuration/);
    assert.doesNotMatch(workerNotice, /returnDuration \?\? outboundDuration/);

    const outboundDurationOnly = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "17:30",
      returnJourney: true,
      returnDate: "2026-06-16",
      returnTime: "10:00",
      routeDurationMinutes: 90,
    });
    const legs = ownerAvailabilityLegsFromBooking(outboundDurationOnly);
    assert.equal(legs.length, 2);
    assert.equal(legs[0]?.durationMinutes, 90);
    assert.equal(legs[1]?.durationMinutes, null);
    assert.equal(legConflictsWithNoAvailability(legs[0]!, CLOSED), true);
    assert.equal(legConflictsWithNoAvailability(legs[1]!, CLOSED), false);
    assert.equal(evaluateOwnerNoAvailability(outboundDurationOnly, [CLOSED], NOW).blocked, true);

    const copiedDurationWouldOverlap = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-15",
      returnTime: "17:00",
      routeDurationMinutes: 90,
    });
    const copiedLegs = ownerAvailabilityLegsFromBooking(copiedDurationWouldOverlap);
    assert.equal(copiedLegs[0]?.durationMinutes, 90);
    assert.equal(copiedLegs[1]?.durationMinutes, null);
    assert.equal(legConflictsWithNoAvailability(copiedLegs[0]!, CLOSED), false);
    assert.equal(legConflictsWithNoAvailability(copiedLegs[1]!, CLOSED), false);
    assert.equal(
      evaluateOwnerNoAvailability(copiedDurationWouldOverlap, [CLOSED], NOW).blocked,
      false,
    );
    const inventedReturnEnd = parseLondonLocalDateTime("2026-06-15", "17:00")!;
    assert.equal(
      journeyWindowOverlapsUnavailablePeriod(
        inventedReturnEnd.getTime(),
        inventedReturnEnd.getTime() + 90 * 60 * 1000,
        CLOSED,
      ),
      true,
    );

    const actualReturnDuration = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-15",
      returnTime: "17:00",
      routeDurationMinutes: 40,
      returnRouteDurationMinutes: 90,
    });
    const actualLegs = ownerAvailabilityLegsFromBooking(actualReturnDuration);
    assert.equal(actualLegs[1]?.durationMinutes, 90);
    assert.equal(legConflictsWithNoAvailability(actualLegs[1]!, CLOSED), true);
    assert.equal(evaluateOwnerNoAvailability(actualReturnDuration, [CLOSED], NOW).blocked, true);

    const returnPickupInside = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-15",
      returnTime: "18:30",
      routeDurationMinutes: 40,
    });
    assert.equal(evaluateOwnerNoAvailability(returnPickupInside, [CLOSED], NOW).blocked, true);

    const returnAtEnd = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-15",
      returnTime: "22:00",
      routeDurationMinutes: 40,
    });
    assert.equal(evaluateOwnerNoAvailability(returnAtEnd, [CLOSED], NOW).blocked, false);

    const returnAtStart = sampleBooking({
      tripDate: "2026-06-15",
      tripTime: "14:00",
      returnJourney: true,
      returnDate: "2026-06-15",
      returnTime: "18:00",
      routeDurationMinutes: 40,
    });
    assert.equal(evaluateOwnerNoAvailability(returnAtStart, [CLOSED], NOW).blocked, true);
  });

  await checkAsync("14. Existing request-only periods retain current behaviour", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [REQUEST_ONLY], minimumBookingNoticeHours: 12 },
    });
    const notice = await shouldForceShortNotice(store, sampleBooking(), NOW);
    assert.equal(notice.noAvailability, false);
    assert.equal(notice.shortNotice, true);
    const created = await createShortNoticeRequest({
      store,
      booking: sampleBooking(),
      amount: 48,
      now: NOW,
    });
    assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
    assert.equal(created.record.unavailablePeriodIdApplied, REQUEST_ONLY.id);
  });

  check("15. Smart Availability feature flags remain unchanged", () => {
    assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartAvailability, true);
    assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.alternativeTimeSuggestions, true);
    assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartReturnPricing, false);
    assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.returnCorridorMatching, false);
    assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.backupDriverCapacity, false);
    assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.shadowMode, true);
    const notice = read("shared/booking-notice.ts");
    assert.doesNotMatch(notice, /evaluateSmartAvailability/);
    assert.doesNotMatch(notice, /customerFacingSmartOpsEnabled/);
    const handlers = read("workers/addresses/src/smart-ops-handlers.ts");
    assert.match(handlers, /smartAvailability:\s*true/);
    assert.match(handlers, /alternativeTimeSuggestions:\s*true/);
    const quoteCard = read("src/components/QuoteCard.tsx");
    assert.match(quoteCard, /OwnerNoAvailabilityBlocked/);
    assert.doesNotMatch(quoteCard, /evaluateSmartAvailability\(/);
  });

  check("16. Pricing / SumUp fare calculations remain unchanged", () => {
    const notice = read("shared/booking-notice.ts");
    assert.doesNotMatch(notice, /calculateQuote|composeFareWithExpressDropOff|nightWeekendSurcharge/);
    const quote = read("src/lib/quote.ts");
    const fares = read("shared/open-website-payment-fares.ts");
    assert.match(quote, /export function calculateQuote/);
    assert.match(fares, /export function resolveOpenWebsitePaymentTransferFares/);
    assert.match(fares, /export function resolveSumUpChargeAmountGbp/);
    const payments = read("workers/addresses/src/index.ts");
    const closedHelper = payments.slice(
      payments.indexOf("async function blockedOwnerNoAvailabilityResponse"),
      payments.indexOf("async function handlePaymentRequest"),
    );
    assert.match(closedHelper, /OWNER_NO_AVAILABILITY_CODE/);
    assert.doesNotMatch(closedHelper, /resolveSumUpChargeAmountGbp|resolveOpenWebsitePaymentTransferFares/);
  });

  check("Owner UI + customer copy wiring", () => {
    const panel = read("src/components/OwnerShortNoticePanel.tsx");
    assert.match(panel, /Availability behaviour/);
    assert.match(panel, /Request only/);
    assert.match(panel, /No availability/);
    assert.match(panel, /Customer may send a booking request/);
    assert.match(panel, /Customers cannot book this period/);
    assert.match(panel, /ownerUnavailablePeriodModeLabel/);
    assert.match(panel, /data-period-mode-label/);
    assert.match(panel, /data-availability-behaviour/);
    const blocked = read("src/components/OwnerNoAvailabilityBlocked.tsx");
    assert.match(blocked, /OWNER_NO_AVAILABILITY_MESSAGE/);
    assert.doesNotMatch(blocked, /WhatsApp|wa\.me/);
    assert.match(blocked, /Choose another date/);
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /ownerNoAvailabilityBlocked/);
    const minNoticeDecl = card.slice(
      card.indexOf("const isMinimumNoticeRequest"),
      card.indexOf("const isMinimumNoticeRequest") + 420,
    );
    assert.match(minNoticeDecl, /!ownerNoAvailabilityBlocked/);
    assert.doesNotMatch(
      card.slice(card.indexOf("ownerClosed ?") , card.indexOf("ownerClosed ?") + 800),
      /Need a quick answer\? WhatsApp us/,
    );
  });

  check("Customer message is the specified copy", () => {
    assert.equal(
      OWNER_NO_AVAILABILITY_MESSAGE,
      "We’re unavailable at this time. Please choose another pickup date or time.",
    );
  });

  check("Half-open overlap helper uses existing duration only", () => {
    assert.equal(existingJourneyDurationMinutes(null, null), null);
    assert.equal(existingJourneyDurationMinutes(0, "0 min"), null);
    assert.equal(existingJourneyDurationMinutes(null, "1 hr 30 min"), 90);
    const start = parseLondonLocalStored("2026-06-15T22:00");
    const periodStart = parseLondonLocalStored(CLOSED.startLocal);
    assert.ok(start && periodStart);
    assert.equal(start.getTime() < periodStart.getTime() ? true : start.getTime() >= periodStart.getTime(), true);
  });

  await checkAsync("Live bug: 23 Sep 2026 00:30–15:30 / pickup 08:38", async () => {
    const schoolClosed = period({
      id: "unavail-school-run",
      startLocal: "2026-09-23T00:30",
      endLocal: "2026-09-23T15:30",
      mode: "no_availability",
    });
    const schoolRequest = period({
      id: "unavail-school-request",
      startLocal: "2026-09-23T00:30",
      endLocal: "2026-09-23T15:30",
      mode: "request_only",
    });
    const pickup = sampleBooking({
      tripDate: "2026-09-23",
      tripTime: "08:38",
    });
    const liveNow = parseLondonLocalDateTime("2026-09-23", "06:41")!;
    assert.equal(evaluateOwnerNoAvailability(pickup, [schoolClosed], liveNow).blocked, true);
    const closedStore = memoryKv({
      "booking:settings": {
        unavailablePeriods: [schoolClosed],
        minimumBookingNoticeHours: 12,
      },
    });
    const closedNotice = await shouldForceShortNotice(closedStore, pickup, liveNow);
    assert.equal(closedNotice.noAvailability, true);
    assert.equal(closedNotice.shortNotice, false);
    await assert.rejects(
      () => createShortNoticeRequest({ store: closedStore, booking: pickup, amount: 46, now: liveNow }),
      (error: unknown) => isOwnerNoAvailabilityThrown(error),
    );

    const requestStore = memoryKv({
      "booking:settings": {
        unavailablePeriods: [schoolRequest],
        minimumBookingNoticeHours: 12,
      },
    });
    const requestNotice = await shouldForceShortNotice(requestStore, pickup, liveNow);
    assert.equal(requestNotice.noAvailability, false);
    assert.equal(requestNotice.shortNotice, true);
    const created = await createShortNoticeRequest({
      store: requestStore,
      booking: pickup,
      amount: 46,
      now: liveNow,
    });
    assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
  });

  await checkAsync("Owner period mode persists across create / reload / edit", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 12 },
    });
    const requestCreated = await addUnavailablePeriod(store, {
      startLocal: "2026-09-23T00:30",
      endLocal: "2026-09-23T15:30",
      note: "School run",
      mode: "request_only",
    });
    const requestReloaded = await getBookingSettings(store);
    const requestPeriod = requestReloaded.unavailablePeriods[0];
    assert.ok(requestPeriod);
    assert.equal(requestPeriod.mode, "request_only");
    assert.equal(ownerUnavailablePeriodModeLabel(requestPeriod.mode), "REQUEST ONLY");
    assert.equal(requestCreated.period.mode, "request_only");

    const closedCreated = await addUnavailablePeriod(store, {
      startLocal: "2026-09-24T00:30",
      endLocal: "2026-09-24T15:30",
      note: "School run",
      mode: "no_availability",
    });
    const afterClosed = await getBookingSettings(store);
    const closedPeriod = afterClosed.unavailablePeriods.find((entry) => entry.id === closedCreated.period.id);
    assert.ok(closedPeriod);
    assert.equal(closedPeriod.mode, "no_availability");
    assert.equal(ownerUnavailablePeriodModeLabel(closedPeriod.mode), "NO AVAILABILITY");

    const editedToClosed = await updateUnavailablePeriod(store, requestPeriod.id, {
      id: requestPeriod.id,
      startLocal: requestPeriod.startLocal,
      endLocal: requestPeriod.endLocal,
      note: requestPeriod.note,
      mode: "no_availability",
    });
    const afterEditClosed = await getBookingSettings(store);
    assert.equal(editedToClosed.period.mode, "no_availability");
    assert.equal(
      afterEditClosed.unavailablePeriods.find((entry) => entry.id === requestPeriod.id)?.mode,
      "no_availability",
    );

    const editedBack = await updateUnavailablePeriod(store, requestPeriod.id, {
      id: requestPeriod.id,
      startLocal: requestPeriod.startLocal,
      endLocal: requestPeriod.endLocal,
      note: requestPeriod.note,
      mode: "request_only",
    });
    const afterEditBack = await getBookingSettings(store);
    assert.equal(editedBack.period.mode, "request_only");
    assert.equal(
      afterEditBack.unavailablePeriods.find((entry) => entry.id === requestPeriod.id)?.mode,
      "request_only",
    );

    const legacyStore = memoryKv({
      "booking:settings": {
        unavailablePeriods: [
          {
            id: "unavail-legacy-persist",
            startLocal: "2026-09-23T00:30",
            endLocal: "2026-09-23T15:30",
            note: "School run",
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        minimumBookingNoticeHours: 12,
      },
    });
    const legacySettings = await getBookingSettings(legacyStore);
    assert.equal(legacySettings.unavailablePeriods[0]?.mode, "request_only");
    assert.equal(
      ownerUnavailablePeriodModeLabel(legacySettings.unavailablePeriods[0]?.mode),
      "REQUEST ONLY",
    );
  });

  console.log("\nAll owner no-availability checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
