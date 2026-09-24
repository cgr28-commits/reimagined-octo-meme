/**
 * Public 5+ luggage selector + capacity confirmation.
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
  PUBLIC_FIVE_PLUS_SUITCASE_LABEL,
  PUBLIC_FIVE_PLUS_SUITCASES,
  applyPublicFivePlusLuggage,
  combinePaymentHoldReasons,
  formatOwnerLargeBags,
  formatOwnerLargeBagsLabel,
  formatPublicSuitcaseChoice,
  isFivePlusLuggage,
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
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  formatSuitcaseChoice,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";
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
    suitcases: 5,
    suitcasesExact: false,
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

const fivePlusHoldCombos: Array<[number, number]> = [
  [1, 5],
  [4, 5],
  [5, 5],
  [7, 5],
];

const normalMinibusCombos: Array<[number, number]> = [
  [5, 0],
  [5, 2],
  [5, 4],
  [6, 4],
  [7, 4],
];

async function main() {
  check("1. Minibus OFF: passenger selector = 1–4", () => {
    assert.deepEqual(publicPassengerOptions(false), [1, 2, 3, 4]);
    assert.equal(publicMaxPassengers(false), 4);
    assert.equal(isValidPublicPassengerCount(4, false), true);
    assert.equal(isValidPublicPassengerCount(5, false), false);
    assert.equal(MAX_PASSENGERS, 4);
  });

  check("2. Minibus OFF: luggage selector = 0–4", () => {
    assert.deepEqual(publicSuitcaseOptions(false), [0, 1, 2, 3, 4]);
    assert.equal(publicMaxSuitcases(false), 4);
    assert.equal(isValidPublicSuitcaseCount(4, false), true);
    assert.equal(isValidPublicSuitcaseCount(5, false), false);
  });

  check("3. Minibus ON: passenger selector = 1–7", () => {
    assert.deepEqual(publicPassengerOptions(true), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(publicMaxPassengers(true), 7);
    assert.equal(isValidPublicPassengerCount(7, true), true);
  });

  check("4. Minibus ON: luggage selector = 0, 1, 2, 3, 4, 5+", () => {
    assert.deepEqual(publicSuitcaseOptions(true), [0, 1, 2, 3, 4, 5]);
    assert.equal(publicMaxSuitcases(true), 5);
    assert.equal(isValidPublicSuitcaseCount(5, true), true);
    assert.equal(formatPublicSuitcaseChoice(5), PUBLIC_FIVE_PLUS_SUITCASE_LABEL);
    assert.equal(formatSuitcaseChoice(5), "5+");
    assert.equal(formatSuitcaseChoice(4), "4");
  });

  check("5. Individual 6 and 7 luggage options are NOT displayed", () => {
    assert.equal(publicSuitcaseOptions(true).includes(6), false);
    assert.equal(publicSuitcaseOptions(true).includes(7), false);
    assert.equal(isValidPublicSuitcaseCount(6, true), false);
    assert.equal(isValidPublicSuitcaseCount(7, true), false);
    const selectors = read("src/components/PublicPartySelectors.tsx");
    assert.match(selectors, /publicSuitcaseOptions/);
    assert.match(selectors, /formatSuitcaseChoice/);
    const rejected6 = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 2, suitcases: 6, pricing: onPricing }),
    );
    const rejected7 = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 2, suitcases: 7, pricing: onPricing }),
    );
    assert.equal(rejected6.ok, false);
    assert.equal(rejected7.ok, false);
  });

  check("6. Selecting 5+ requires 7 Seater Minibus", () => {
    assert.equal(selectVehicleForParty(1, 5), MINIBUS_VEHICLE);
    assert.equal(selectVehicleForParty(4, 5), MINIBUS_VEHICLE);
    assert.equal(selectVehicleForParty(7, 5), MINIBUS_VEHICLE);
    assert.notEqual(selectVehicleForParty(4, 5), SALOON_VEHICLE);
    assert.notEqual(selectVehicleForParty(4, 5), ESTATE_VEHICLE);
    const quoted = calculateAuthoritativeWebsiteQuote(
      quoteInput({
        passengers: 4,
        suitcases: 5,
        pricing: onPricing,
        vehicleType: SALOON_VEHICLE,
      }),
    );
    assert.equal(quoted.ok, true);
    if (quoted.ok) assert.equal(quoted.vehicleType, MINIBUS_VEHICLE);
  });

  check("7. 5+ always requires luggage-capacity confirmation", () => {
    assert.equal(isFivePlusLuggage(5), true);
    assert.equal(isFivePlusLuggage(4, { suitcasesExact: false }), true);
    assert.equal(isFivePlusLuggage(4), false);
    for (const [pax, bags] of fivePlusHoldCombos) {
      assert.equal(
        needsLuggageCapacityConfirmation(pax, bags, { suitcasesExact: false }),
        true,
        `${pax}+5+ should hold`,
      );
    }
    assert.equal(needsLuggageCapacityConfirmation(1, 5), true);
    assert.equal(needsLuggageCapacityConfirmation(2, 5), true);
  });

  check("8. 4 passengers + 5+ bags requires confirmation", () => {
    assert.equal(needsLuggageCapacityConfirmation(4, 5, { suitcasesExact: false }), true);
    const quoted = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 4, suitcases: 5, pricing: onPricing }),
    );
    assert.equal(quoted.ok, true);
    if (quoted.ok) {
      assert.equal(quoted.vehicleType, MINIBUS_VEHICLE);
      assert.equal(quoted.needsLuggageCapacityConfirmation, true);
    }
  });

  check("9. 5 passengers + 5+ bags requires confirmation", () => {
    assert.equal(needsLuggageCapacityConfirmation(5, 5, { suitcasesExact: false }), true);
    const quoted = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 5, suitcases: 5, pricing: onPricing }),
    );
    assert.equal(quoted.ok, true);
    if (quoted.ok) {
      assert.equal(quoted.needsLuggageCapacityConfirmation, true);
    }
  });

  check("10. 7 passengers + 5+ bags requires confirmation", () => {
    assert.equal(needsLuggageCapacityConfirmation(7, 5, { suitcasesExact: false }), true);
    const quoted = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 7, suitcases: 5, pricing: onPricing }),
    );
    assert.equal(quoted.ok, true);
    if (quoted.ok) {
      assert.equal(quoted.vehicleType, MINIBUS_VEHICLE);
      assert.equal(quoted.needsLuggageCapacityConfirmation, true);
    }
  });

  check("11. Fare remains visible and unchanged by the hold", () => {
    const hold = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 7, suitcases: 5, pricing: onPricing }),
    );
    const normal = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 5, suitcases: 2, pricing: onPricing }),
    );
    assert.equal(hold.ok, true);
    assert.equal(normal.ok, true);
    if (hold.ok && normal.ok) {
      assert.equal(hold.amount, normal.amount);
      assert.match(hold.amountLabel, /£/);
      assert.equal(hold.needsLuggageCapacityConfirmation, true);
      assert.equal(normal.needsLuggageCapacityConfirmation, false);
    }
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /capacityNeedsConfirm/);
    assert.match(card, /LUGGAGE_CAPACITY_CONFIRMATION_CTA/);
    assert.match(card, /data-luggage-capacity-confirmation/);
    const showcase = read("src/components/QuoteResultShowcase.tsx");
    assert.match(showcase, /capacityConfirmation/);
    assert.match(showcase, /5\+ large bags/);
  });

  check("12. SumUp cannot be created before capacity approval", () => {
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /LUGGAGE_CAPACITY_CONFIRMATION_CTA/);
    assert.match(card, /Confirm booking & pay securely/);
    const index = read("workers/addresses/src/index.ts");
    assert.match(index, /applyPublicFivePlusLuggage/);
    assert.match(index, /notice\.shortNotice \|\| luggageHold/);
    assert.match(index, /createShortNoticeRequest/);
    const holdAt = index.indexOf("notice.shortNotice || luggageHold");
    const sumupAfter = index.indexOf("createSumUpHostedCheckout", holdAt);
    assert.ok(holdAt > 0);
    assert.ok(sumupAfter > holdAt);
  });

  check("13. Worker independently enforces capacity confirmation", () => {
    const index = read("workers/addresses/src/index.ts");
    assert.match(index, /needsLuggageCapacityConfirmation\(booking\.passengers/);
    assert.match(index, /suitcasesExact: booking\.suitcasesExact/);
    assert.match(index, /applyPublicFivePlusLuggage/);
    assert.match(index, /MINIBUS_VEHICLE/);
    const handlers = read("workers/addresses/src/short-notice-handlers.ts");
    assert.match(handlers, /combinePaymentHoldReasons/);
    assert.match(handlers, /suitcasesExact: options\.booking\.suitcasesExact/);
    const tampered = applyPublicFivePlusLuggage({
      suitcases: 6,
      suitcasesExact: true,
      vehicle: SALOON_VEHICLE,
    });
    assert.equal(tampered.suitcases, PUBLIC_FIVE_PLUS_SUITCASES);
    assert.equal(tampered.suitcasesExact, false);
    assert.equal(needsLuggageCapacityConfirmation(4, tampered.suitcases, {
      suitcasesExact: tampered.suitcasesExact,
    }), true);
  });

  check("14. Owner Dashboard records luggage as 5+, not exactly 5", () => {
    assert.equal(formatOwnerLargeBags(5, { suitcasesExact: false }), "5+");
    assert.equal(formatOwnerLargeBagsLabel(5, { suitcasesExact: false }), "5+ large bags");
    assert.notEqual(formatOwnerLargeBags(5, { suitcasesExact: false }), "5");
    assert.equal(formatOwnerLargeBags(4, { suitcasesExact: true }), "4");
    const panel = read("src/components/OwnerShortNoticePanel.tsx");
    assert.match(panel, /formatOwnerLargeBagsLabel/);
    assert.match(panel, /suitcasesExact/);
    assert.match(panel, /Large bags/);
    assert.match(panel, /LUGGAGE_CAPACITY_OWNER_REASON/);
    const index = read("workers/addresses/src/index.ts");
    assert.match(index, /formatOwnerLargeBags\(booking\.suitcases/);
    assert.doesNotMatch(index, /Large bags: \$\{booking\.suitcases\}/);
  });

  check("15. Normal Minibus combinations continue to work", () => {
    for (const [pax, bags] of normalMinibusCombos) {
      assert.equal(
        needsLuggageCapacityConfirmation(pax, bags),
        false,
        `${pax}+${bags} should be normal`,
      );
      assert.equal(selectVehicleForParty(pax, bags), MINIBUS_VEHICLE);
    }
    const quoted = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 5, suitcases: 2, pricing: onPricing }),
    );
    assert.equal(quoted.ok, true);
    if (quoted.ok) {
      assert.equal(quoted.vehicleType, MINIBUS_VEHICLE);
      assert.equal(quoted.needsLuggageCapacityConfirmation, false);
    }
    assert.equal(needsLuggageCapacityConfirmation(7, 4), false);
    assert.equal(MINIBUS_HIGH_LOAD_COMBINED_THRESHOLD, 12);
  });

  check("16. Existing Saloon/Estate behaviour remains unchanged", () => {
    assert.equal(selectVehicleForParty(1, 0), SALOON_VEHICLE);
    assert.equal(selectVehicleForParty(4, 2), SALOON_VEHICLE);
    assert.equal(selectVehicleForParty(2, 3), ESTATE_VEHICLE);
    assert.equal(selectVehicleForParty(4, 4), ESTATE_VEHICLE);
    assert.equal(needsLuggageCapacityConfirmation(4, 4), false);
    const saloon = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 2, suitcases: 1, pricing: onPricing }),
    );
    const estate = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 2, suitcases: 4, pricing: onPricing }),
    );
    assert.equal(saloon.ok, true);
    assert.equal(estate.ok, true);
    if (saloon.ok) {
      assert.equal(saloon.vehicleType, SALOON_VEHICLE);
      assert.equal(saloon.needsLuggageCapacityConfirmation, false);
    }
    if (estate.ok) {
      assert.equal(estate.vehicleType, ESTATE_VEHICLE);
      assert.equal(estate.needsLuggageCapacityConfirmation, false);
    }
  });

  check("17. Minibus pricing remains unchanged", () => {
    const fare = minibusBaseFareFromSaloon(50, onPricing);
    assert.equal(fare.estateGbp, 56);
    assert.equal(fare.minibusQuotedGbp, 86.8);
    assert.equal(fare.minibusExactGbp, 86.8);
    const hold = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 7, suitcases: 5, pricing: onPricing }),
    );
    const normal = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 5, suitcases: 2, pricing: onPricing }),
    );
    assert.equal(hold.ok && normal.ok, true);
    if (hold.ok && normal.ok) {
      assert.equal(hold.amount, normal.amount);
    }
  });

  check("18. Minibus OFF remains the safe fallback if configuration cannot be read", () => {
    assert.equal(publicMaxPassengers(false), 4);
    assert.equal(publicMaxSuitcases(false), 4);
    assert.deepEqual(publicPassengerOptions(false), [1, 2, 3, 4]);
    assert.deepEqual(publicSuitcaseOptions(false), [0, 1, 2, 3, 4]);
    const off = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 7, suitcases: 5, pricing: offPricing }),
    );
    assert.equal(off.ok, false);
    const missing = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 5, suitcases: 2 }),
    );
    assert.equal(missing.ok, false);
  });

  check("Customer wording is confirmation, not rejection", () => {
    assert.equal(LUGGAGE_CAPACITY_CONFIRMATION_HEADING, "Luggage capacity confirmation required");
    assert.equal(
      LUGGAGE_CAPACITY_CONFIRMATION_BODY,
      "With this number of passengers and large bags, we need to confirm the available 7 Seater has sufficient luggage space before you book.",
    );
    assert.equal(LUGGAGE_CAPACITY_CONFIRMATION_CTA, "Request Capacity Confirmation");
    assert.equal(LUGGAGE_CAPACITY_OWNER_REASON, "Luggage capacity confirmation");
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /LUGGAGE_CAPACITY_CONFIRMATION_HEADING/);
    assert.doesNotMatch(card, /booking rejected/i);
    assert.doesNotMatch(card, /vehicle cannot carry this/i);
    const showcase = read("src/components/QuoteResultShowcase.tsx");
    assert.match(showcase, /quote-minibus\.webp/);
  });

  await checkAsync("Outside short-notice window, 7 + 5+ still creates an owner hold", async () => {
    const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
    const now = pickupOffsetNow("2026-06-15", "14:00", 48);
    const booking = sampleBooking({
      passengers: 7,
      suitcases: 5,
      suitcasesExact: false,
    });
    const notice = await shouldForceShortNotice(store, booking, now);
    assert.equal(notice.shortNotice, false);
    assert.equal(notice.luggageCapacity, true);
    const created = await createShortNoticeRequest({
      store,
      booking,
      amount: 86.8,
      now,
    });
    assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
    assert.equal(created.record.amount, 86.8);
    assert.equal(created.record.amountLabel, "£86.80");
    assert.deepEqual(created.record.holdReasons, ["luggage_capacity"]);
    assert.equal(created.record.booking.suitcasesExact, false);
    assert.equal(created.record.booking.suitcases, 5);
    assert.equal(
      formatOwnerLargeBags(created.record.booking.suitcases, {
        suitcasesExact: created.record.booking.suitcasesExact,
      }),
      "5+",
    );
  });

  await checkAsync("5+2 outside short-notice window cannot create a hold", async () => {
    const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
    const now = pickupOffsetNow("2026-06-15", "14:00", 48);
    const notice = await shouldForceShortNotice(
      store,
      sampleBooking({ passengers: 5, suitcases: 2, suitcasesExact: true }),
      now,
    );
    assert.equal(notice.shortNotice, false);
    assert.equal(notice.luggageCapacity, false);
    await assert.rejects(
      () =>
        createShortNoticeRequest({
          store,
          booking: sampleBooking({ passengers: 5, suitcases: 2, suitcasesExact: true }),
          amount: 86.8,
          now,
        }),
      /not inside a short-notice window/,
    );
  });

  check("Hold reasons combine short-notice and 5+ luggage capacity", () => {
    assert.deepEqual(
      combinePaymentHoldReasons({
        underMinimumNotice: true,
        blockingPeriodId: null,
        passengers: 4,
        suitcases: 5,
        suitcasesExact: false,
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

  check("Preview pages cover normal Minibus and 7 + 5+", () => {
    const high = read("src/app/owner/pricing-preview/quote-high-load/page.tsx");
    const normal = read("src/app/owner/pricing-preview/quote-normal-minibus/page.tsx");
    const preview = read("src/components/PreviewQuoteCapacityClient.tsx");
    assert.match(high, /initialPassengers=\{7\}/);
    assert.match(high, /initialSuitcases=\{5\}/);
    assert.match(normal, /initialPassengers=\{5\}/);
    assert.match(normal, /initialSuitcases=\{2\}/);
    assert.match(preview, /data-luggage-capacity-confirmation/);
    assert.match(preview, /does not create a SumUp checkout/);
  });

  console.log("\nLuggage 5+ capacity confirmation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
