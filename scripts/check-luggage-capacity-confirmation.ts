/**
 * High-load 7 Seater luggage capacity confirmation.
 * Run: npx tsx scripts/check-luggage-capacity-confirmation.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LUGGAGE_CAPACITY_CONFIRMATION_BODY,
  LUGGAGE_CAPACITY_CONFIRMATION_CTA,
  LUGGAGE_CAPACITY_CONFIRMATION_HEADING,
  LUGGAGE_CAPACITY_OWNER_REASON,
  MINIBUS_HIGH_LOAD_COMBINED_THRESHOLD,
  combinePaymentHoldReasons,
  needsLuggageCapacityConfirmation,
} from "../shared/vehicle-capacity";
import {
  MAX_PASSENGERS,
  isValidPublicPassengerCount,
  isValidPublicSuitcaseCount,
  publicPassengerOptions,
  publicSuitcaseOptions,
} from "../shared/passenger-limits";
import {
  defaultOwnerPricingSettings,
  minibusBaseFareFromSaloon,
  publicMaxPassengers,
  publicMaxSuitcases,
} from "../shared/owner-pricing-config";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { MINIBUS_VEHICLE, selectVehicleForParty } from "../src/lib/vehicle-selection";
import {
  createShortNoticeRequest,
  shouldForceShortNotice,
} from "../workers/addresses/src/short-notice-handlers";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { parseLondonLocalDateTime } from "../shared/uk-time";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

async function checkAsync(label: string, fn: () => Promise<void>) {
  await fn();
  console.log(`OK  ${label}`);
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
    async put(key: string, value: string) {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
}

function pickupOffsetNow(tripDate: string, tripTime: string, hoursBefore: number): Date {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  assert.ok(pickup, `Could not parse ${tripDate} ${tripTime}`);
  return new Date(pickup.getTime() - hoursBefore * 60 * 60 * 1000);
}

function sampleBooking(overrides: Partial<PaidBookingDetails> = {}): PaidBookingDetails {
  return {
    customerName: "Capacity Example",
    customerEmail: "capacity@example.com",
    mobileNumber: "07700900123",
    pickupLabel: "10 Donegall Square North, Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: "2026-06-15",
    tripTime: "14:00",
    returnJourney: false,
    passengers: 7,
    suitcases: 7,
    vehicle: "7 Seater Minibus",
    ...overrides,
  };
}

function quoteInput(overrides: Record<string, unknown> = {}) {
  return {
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS" as const,
    fromAirport: false,
    returnJourney: false,
    passengers: 5,
    suitcases: 2,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    ...overrides,
  };
}

const offPricing = defaultOwnerPricingSettings();
const onPricing = {
  ...defaultOwnerPricingSettings(),
  minibus: { publicEnabled: true, multiplier: 1.55 },
};

const triggerCombos: Array<[number, number]> = [
  [5, 7],
  [6, 6],
  [6, 7],
  [7, 5],
  [7, 6],
  [7, 7],
];

const normalMinibusCombos: Array<[number, number]> = [
  [5, 0],
  [5, 2],
  [5, 4],
  [5, 6],
  [6, 4],
  [6, 5],
  [7, 4],
  [4, 7],
  [3, 7],
  [2, 5],
];

async function main() {
  check("Threshold is combined passenger + bags >= 12 on a Minibus party", () => {
    assert.equal(MINIBUS_HIGH_LOAD_COMBINED_THRESHOLD, 12);
    assert.equal(needsLuggageCapacityConfirmation(4, 4), false);
    assert.equal(needsLuggageCapacityConfirmation(7, 7), true);
  });

  check("7 passengers + 7 bags requires capacity confirmation", () => {
    assert.equal(selectVehicleForParty(7, 7), MINIBUS_VEHICLE);
    assert.equal(needsLuggageCapacityConfirmation(7, 7), true);
  });

  check("Conservative threshold combinations trigger confirmation", () => {
    for (const [pax, bags] of triggerCombos) {
      assert.equal(
        needsLuggageCapacityConfirmation(pax, bags),
        true,
        `${pax}+${bags} should trigger`,
      );
      assert.equal(pax + bags >= 12, true);
      assert.equal(selectVehicleForParty(pax, bags), MINIBUS_VEHICLE);
    }
  });

  check("Normal 7 Seater combinations still book without confirmation", () => {
    for (const [pax, bags] of normalMinibusCombos) {
      assert.equal(
        needsLuggageCapacityConfirmation(pax, bags),
        false,
        `${pax}+${bags} should be normal`,
      );
    }
  });

  check("Minibus OFF remains 1–4 passengers / 0–4 bags", () => {
    assert.equal(publicMaxPassengers(false), 4);
    assert.equal(publicMaxSuitcases(false), 4);
    assert.deepEqual(publicPassengerOptions(false), [1, 2, 3, 4]);
    assert.deepEqual(publicSuitcaseOptions(false), [0, 1, 2, 3, 4]);
    assert.equal(isValidPublicPassengerCount(5, false), false);
    assert.equal(isValidPublicSuitcaseCount(5, false), false);
    assert.equal(MAX_PASSENGERS, 4);
  });

  check("Minibus ON remains 1–7 passengers / 0–7 bags", () => {
    assert.equal(publicMaxPassengers(true), 7);
    assert.equal(publicMaxSuitcases(true), 7);
    assert.deepEqual(publicPassengerOptions(true), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(publicSuitcaseOptions(true), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(isValidPublicPassengerCount(7, true), true);
    assert.equal(isValidPublicSuitcaseCount(7, true), true);
  });

  check("Fare calculation is unchanged (Estate × 1.55, penny only)", () => {
    const fare = minibusBaseFareFromSaloon(50, onPricing);
    assert.equal(fare.estateGbp, 56);
    assert.equal(fare.minibusQuotedGbp, 86.8);
    assert.equal(fare.minibusExactGbp, 86.8);
    const high = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 7, suitcases: 7, pricing: onPricing }),
    );
    const normal = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 5, suitcases: 2, pricing: onPricing }),
    );
    assert.equal(high.ok, true);
    assert.equal(normal.ok, true);
    if (high.ok && normal.ok) {
      assert.equal(high.vehicleType, MINIBUS_VEHICLE);
      assert.equal(normal.vehicleType, MINIBUS_VEHICLE);
      assert.equal(high.amount, normal.amount);
      assert.equal(high.needsLuggageCapacityConfirmation, true);
      assert.equal(normal.needsLuggageCapacityConfirmation, false);
    }
    const off = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 7, suitcases: 7, pricing: offPricing }),
    );
    assert.equal(off.ok, false);
  });

  check("Customer wording is confirmation, not rejection", () => {
    assert.equal(LUGGAGE_CAPACITY_CONFIRMATION_HEADING, "Luggage capacity confirmation required");
    assert.match(LUGGAGE_CAPACITY_CONFIRMATION_BODY, /confirm the available 7 Seater/);
    assert.equal(LUGGAGE_CAPACITY_CONFIRMATION_CTA, "Request Capacity Confirmation");
    assert.equal(LUGGAGE_CAPACITY_OWNER_REASON, "Luggage capacity confirmation");
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /LUGGAGE_CAPACITY_CONFIRMATION_HEADING/);
    assert.match(card, /LUGGAGE_CAPACITY_CONFIRMATION_CTA/);
    assert.doesNotMatch(card, /booking rejected/i);
    assert.doesNotMatch(card, /vehicle cannot carry this/i);
    assert.doesNotMatch(card, /unavailable for this luggage/i);
  });

  check("Quote UI still shows fare and does not open Pay Now for high load", () => {
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /capacityNeedsConfirm/);
    assert.match(card, /LUGGAGE_CAPACITY_CONFIRMATION_CTA/);
    assert.match(card, /Confirm booking & pay securely/);
    assert.match(card, /data-luggage-capacity-confirmation/);
    assert.doesNotMatch(card, /I understand luggage capacity may need written confirmation/);
    const showcase = read("src/components/QuoteResultShowcase.tsx");
    assert.match(showcase, /capacityConfirmation/);
    assert.match(showcase, /no payment until confirmed/);
  });

  check("Worker independently intercepts high-load before SumUp", () => {
    const index = read("workers/addresses/src/index.ts");
    assert.match(index, /needsLuggageCapacityConfirmation\(booking\.passengers/);
    assert.match(index, /notice\.shortNotice \|\| luggageHold/);
    assert.match(index, /createShortNoticeRequest/);
    const holdAt = index.indexOf("notice.shortNotice || luggageHold");
    const sumupAfter = index.indexOf("createSumUpHostedCheckout", holdAt);
    assert.ok(holdAt > 0);
    assert.ok(sumupAfter > holdAt);
    const handlers = read("workers/addresses/src/short-notice-handlers.ts");
    assert.match(handlers, /combinePaymentHoldReasons/);
    assert.match(handlers, /holdReasons/);
  });

  await checkAsync("Outside short-notice window, 7+7 still creates an owner hold", async () => {
    const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
    const now = pickupOffsetNow("2026-06-15", "14:00", 48);
    const notice = await shouldForceShortNotice(
      store,
      sampleBooking({ passengers: 7, suitcases: 7 }),
      now,
    );
    assert.equal(notice.shortNotice, false);
    assert.equal(notice.luggageCapacity, true);
    const created = await createShortNoticeRequest({
      store,
      booking: sampleBooking({ passengers: 7, suitcases: 7 }),
      amount: 86.8,
      now,
    });
    assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
    assert.equal(created.record.amount, 86.8);
    assert.equal(created.record.amountLabel, "£86.80");
    assert.deepEqual(created.record.holdReasons, ["luggage_capacity"]);
    assert.equal(created.whatsappUrl.includes("wa.me"), true);
  });

  await checkAsync("5+2 outside short-notice window cannot create a hold", async () => {
    const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
    const now = pickupOffsetNow("2026-06-15", "14:00", 48);
    const notice = await shouldForceShortNotice(
      store,
      sampleBooking({ passengers: 5, suitcases: 2 }),
      now,
    );
    assert.equal(notice.shortNotice, false);
    assert.equal(notice.luggageCapacity, false);
    await assert.rejects(
      () =>
        createShortNoticeRequest({
          store,
          booking: sampleBooking({ passengers: 5, suitcases: 2 }),
          amount: 86.8,
          now,
        }),
      /not inside a short-notice window/,
    );
  });

  check("Hold reasons combine short-notice and luggage capacity", () => {
    assert.deepEqual(
      combinePaymentHoldReasons({
        underMinimumNotice: true,
        blockingPeriodId: null,
        passengers: 7,
        suitcases: 7,
      }),
      ["short_notice", "luggage_capacity"],
    );
    assert.deepEqual(
      combinePaymentHoldReasons({
        underMinimumNotice: false,
        blockingPeriodId: null,
        passengers: 5,
        suitcases: 2,
      }),
      [],
    );
  });

  check("Owner Dashboard shows luggage capacity reason and journey details", () => {
    const panel = read("src/components/OwnerShortNoticePanel.tsx");
    assert.match(panel, /LUGGAGE_CAPACITY_OWNER_REASON/);
    assert.match(panel, /ownerHoldReasonLabel/);
    assert.match(panel, /Passenger count/);
    assert.match(panel, /Luggage details/);
    assert.match(panel, /Quoted journey price/);
    assert.match(panel, /Reason held/);
  });

  check("Preview pages cover normal Minibus and high-load 7+7", () => {
    const high = read("src/app/owner/pricing-preview/quote-high-load/page.tsx");
    const normal = read("src/app/owner/pricing-preview/quote-normal-minibus/page.tsx");
    const preview = read("src/components/PreviewQuoteCapacityClient.tsx");
    assert.match(high, /initialPassengers=\{7\}/);
    assert.match(high, /initialSuitcases=\{7\}/);
    assert.match(normal, /initialPassengers=\{5\}/);
    assert.match(normal, /initialSuitcases=\{2\}/);
    assert.match(preview, /data-luggage-capacity-confirmation/);
    assert.match(preview, /data-preview-minibus-fare/);
    assert.match(preview, /does not create a SumUp checkout/);
  });

  console.log("\nLuggage capacity confirmation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
